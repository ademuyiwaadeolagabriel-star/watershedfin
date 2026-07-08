import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { KYC_STATUSES } from '@/lib/constants';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * GET /api/customer/kyc?userId=
 * Returns the current KYC status + which step the customer is on
 * (personal / physical / selfie) plus any decline reason.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/customer/kyc
 * Body: { userId, step: 'personal'|'physical'|'selfie', data }
 *
 * - personal: validates & saves b_day/b_month/b_year, source_of_funds, doc_type,
 *   doc_number, city, state, country, line_1, postal_code on Business.
 *   Returns next step = 'physical'.
 * - physical: validates & saves business_type, doc_front, doc_back,
 *   proof_of_address, doc_shop_photo, doc_cac (if registered). Returns 'selfie'.
 * - selfie: accepts base64 PNG selfie, stores at /public/kyc/{userId}_selfie.png,
 *   sets kycStatus='PROCESSING', dispatches notification. Returns completed.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, step, data } = body as {
      userId: string;
      step: 'personal' | 'physical' | 'selfie';
      data: Record<string, any>;
    };

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!['personal', 'physical', 'selfie'].includes(step)) {
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

    // step === 'selfie' — store base64 PNG selfie
    const selfieData: string = data.selfie;
    if (!selfieData || typeof selfieData !== 'string') {
      return NextResponse.json({ error: 'Missing selfie image' }, { status: 400 });
    }

    // Strip data: URL prefix if present
    const base64 = selfieData.replace(/^data:image\/\w+;base64,/, '');
    const kycDir = path.join(process.cwd(), 'public', 'kyc');
    await fs.mkdir(kycDir, { recursive: true });
    const fileName = `${userId}_selfie.png`;
    await fs.writeFile(path.join(kycDir, fileName), Buffer.from(base64, 'base64'));
    const selfiePath = `/kyc/${fileName}`;

    // Update Business + User kycStatus
    await db.business.update({
      where: { id: businessId },
      data: { selfie: selfiePath, kycStatus: KYC_STATUSES.PROCESSING },
    });
    await db.user.update({
      where: { id: userId },
      data: { kycStatus: KYC_STATUSES.PROCESSING },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        userId,
        action: 'created',
        module: 'kyc',
        description: `${user.firstName} ${user.lastName} submitted KYC for review`,
        severity: 'info',
        metadata: JSON.stringify({ step: 'selfie', selfiePath }),
      },
    });

    // Dispatch in-app notification email (best-effort)
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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
