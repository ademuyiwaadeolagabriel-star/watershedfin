import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { KYC_STATUSES } from '@/lib/constants';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';

// ============================================================================
// /api/customer/kyc
//   GET  — fetch own KYC status + current step
//   POST — submit a KYC step (personal | physical | selfie)
//
// v53 — P1 IDOR fix + P0 #26 (public KYC storage):
//   - userId is now derived from the JWT, not from ?userId= / body.userId
//   - selfie is no longer written to /public/kyc/{userId}_selfie.png
//     (public static file is unsuitable for biometric data). Now uses
//     private blob storage (Vercel Blob access: 'private') + the
//     authenticated proxy path /api/customer/kyc-file/{userId}/{filename}
//     (introduced in v50) for reads. Dev mode falls back to /tmp.
// ============================================================================

export async function GET(req: NextRequest) {
  // v51 — customer auth gate.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    // v53 — IDOR fix: userId from JWT, not query string.
    const userId = authPayload_v51.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        email: true,
        kycStatus: true,
        business: true,
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const biz = user.business;
    const kycStatus = user.kycStatus || KYC_STATUSES.DRAFT;

    // Determine which step the user is on based on what's already filled.
    let step: 'personal' | 'physical' | 'selfie' = 'personal';
    if (
      biz?.bDay &&
      biz?.bMonth &&
      biz?.bYear &&
      biz?.sourceOfFunds &&
      biz?.docType &&
      biz?.docNumber &&
      biz?.line1 &&
      biz?.city &&
      biz?.state &&
      biz?.country &&
      biz?.postalCode
    ) {
      step = 'physical';
    }
    if (
      step === 'physical' &&
      biz?.businessType &&
      biz?.docFront &&
      biz?.docBack &&
      biz?.proofOfAddress &&
      biz?.docShopPhoto &&
      (biz?.businessType !== 'registered' || biz?.docCac)
    ) {
      step = 'selfie';
    }

    return NextResponse.json({
      userId: user.id,
      kycStatus,
      step,
      business: biz,
      declineReason: biz?.declineReason || null,
    });
  } catch (e: any) {
    console.error('Customer KYC GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — customer auth gate.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    const body = await req.json().catch(() => ({}));
    const { step, data } = body as {
      step: 'personal' | 'physical' | 'selfie';
      data: Record<string, any>;
    } || {};

    // v53 — IDOR fix: userId from JWT, not body.
    const userId = authPayload_v51.id;

    if (!step || !['personal', 'physical', 'selfie'].includes(step)) {
      return NextResponse.json({ error: 'Invalid step' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, firstName: true, lastName: true, email: true, businessId: true, business: true },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Ensure a Business row exists for this user
    let businessId = user.businessId;
    if (!businessId) {
      const biz = await db.business.create({
        data: { userId: user.id, name: `${user.firstName} ${user.lastName}` },
      });
      businessId = biz.id;
    }

    if (step === 'personal') {
      const required = [
        'b_day', 'b_month', 'b_year', 'source_of_funds', 'doc_type',
        'doc_number', 'city', 'state', 'country', 'line_1', 'postal_code',
      ];
      for (const f of required) {
        if (data[f] === undefined || data[f] === null || data[f] === '') {
          return NextResponse.json(
            { error: `Missing required field: ${f}` },
            { status: 400 }
          );
        }
      }

      await db.business.update({
        where: { id: businessId },
        data: {
          bDay: Number(data.b_day),
          bMonth: Number(data.b_month),
          bYear: Number(data.b_year),
          sourceOfFunds: String(data.source_of_funds),
          docType: String(data.doc_type),
          docNumber: String(data.doc_number),
          line1: String(data.line_1),
          line2: data.line_2 ? String(data.line_2) : null,
          city: String(data.city),
          state: String(data.state),
          country: String(data.country),
          postalCode: String(data.postal_code),
        },
      });

      return NextResponse.json({
        ok: true,
        step: 'personal',
        nextStep: 'physical',
      });
    }

    if (step === 'physical') {
      const required = ['business_type', 'doc_front', 'doc_back', 'proof_of_address', 'doc_shop_photo'];
      for (const f of required) {
        if (!data[f]) {
          return NextResponse.json(
            { error: `Missing required field: ${f}` },
            { status: 400 }
          );
        }
      }
      if (data.business_type === 'registered' && !data.doc_cac) {
        return NextResponse.json(
          { error: 'CAC document is required for registered companies' },
          { status: 400 }
        );
      }

      await db.business.update({
        where: { id: businessId },
        data: {
          businessType: String(data.business_type),
          docFront: String(data.doc_front),
          docBack: String(data.doc_back),
          proofOfAddress: String(data.proof_of_address),
          docShopPhoto: String(data.doc_shop_photo),
          docCac: data.doc_cac ? String(data.doc_cac) : null,
        },
      });

      return NextResponse.json({
        ok: true,
        step: 'physical',
        nextStep: 'selfie',
      });
    }

    // step === 'selfie' — store base64 PNG selfie PRIVATELY.
    // v53 — P0 #26: previously wrote to /public/kyc/{userId}_selfie.png.
    // Biometric data must not be in /public. Now uses the v50 kyc-upload
    // pattern: private blob + authenticated proxy path.
    const selfieData: string = data?.selfie;
    if (!selfieData || typeof selfieData !== 'string') {
      return NextResponse.json({ error: 'Missing selfie image' }, { status: 400 });
    }

    // Strip data: URL prefix if present
    const base64 = selfieData.replace(/^data:image\/\w+;base64,/, '');
    const buf = Buffer.from(base64, 'base64');

    // v53 — private storage. Use random filename + userId-prefixed path
    // for ownership-check convenience at read time.
    const safeName = `${userId}/${randomUUID()}-selfie.png`;
    let selfiePath: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production: Vercel Blob private access. Blob URL is never exposed
      // to the client; only the proxy path is stored on the Business row.
      try {
        await put(`kyc-private/${safeName}`, buf, {
          access: 'private',
          addRandomSuffix: false,
          contentType: 'image/png',
        });
        selfiePath = `/api/customer/kyc-file/${safeName}`;
      } catch (blobErr: any) {
        console.error('[KYC] blob upload failed:', blobErr?.message);
        return NextResponse.json({ error: 'Failed to upload selfie' }, { status: 502 });
      }
    } else {
      // Dev: write to /tmp/uploads/kyc-private/{userId}/{filename}
      const tmpDir = path.join('/tmp', 'uploads', 'kyc-private', userId);
      await fs.mkdir(tmpDir, { recursive: true });
      const tmpName = `${randomUUID()}-selfie.png`;
      await fs.writeFile(path.join(tmpDir, tmpName), buf);
      selfiePath = `/api/customer/kyc-file/${userId}/${tmpName}`;
    }

    // Update Business + User kycStatus atomically
    await db.$transaction(async (tx) => {
      await tx.business.update({
        where: { id: businessId },
        data: { selfie: selfiePath, kycStatus: KYC_STATUSES.PROCESSING },
      });
      await tx.user.update({
        where: { id: userId },
        data: { kycStatus: KYC_STATUSES.PROCESSING },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: 'created',
          module: 'kyc',
          description: `${user.firstName} ${user.lastName} submitted KYC for review`,
          severity: 'info',
          metadata: JSON.stringify({ step: 'selfie', selfiePath, authSource: 'jwt' }),
        },
      });
    });

    // Dispatch in-app notification email (best-effort, post-commit)
    if (user.email) {
      await db.sentEmail.create({
        data: {
          userId,
          to: user.email,
          subject: 'KYC Submission Received — Watershed Capital',
          body: `Hello ${user.firstName},\n\nYour KYC documents have been received and are now under review by our compliance team. You will be notified once a decision is reached (typically within 24–48 hours).\n\nThank you for banking with Watershed Capital.`,
          template: 'kyc_submitted',
        },
      }).catch(() => {});
    }

    return NextResponse.json({
      ok: true,
      step: 'selfie',
      completed: true,
      kycStatus: KYC_STATUSES.PROCESSING,
    });
  } catch (e: any) {
    console.error('Customer KYC POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
