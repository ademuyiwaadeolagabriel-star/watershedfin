import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';

const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']);
const MAX_SIZE = 10 * 1024 * 1024;

export async function POST(req: NextRequest) {
  const authResult = await requireCustomerAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const userId = (authResult as { id: string }).id;

  let localPath: string | null = null;
  try {
    const formData = await req.formData();
    const referenceInput = String(formData.get('reference') || '').trim();
    const file = formData.get('file');
    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'Proof of payment file is required' }, { status: 400 });
    }

    const mime = file.type;
    if (!ALLOWED_TYPES.has(mime)) {
      return NextResponse.json({ error: 'Unsupported proof file type.' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_SIZE) {
      return NextResponse.json({ error: 'File must be between 1 byte and 10MB.' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, onboardingStage: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    if (!['payment_pending', 'kyc_approved', 'payment_confirmed'].includes(user.onboardingStage)) {
      return NextResponse.json({ error: `Manual CAC payment is not allowed at stage ${user.onboardingStage}.` }, { status: 400 });
    }

    const feeSetting = await db.systemSetting.findUnique({ where: { key: 'fee_cac_search' } });
    const amount = feeSetting && feeSetting.active !== false ? Number(feeSetting.value) : 5000;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'CAC fee is not configured correctly.' }, { status: 500 });
    }

    const ext = mime === 'application/pdf' ? 'pdf' : mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg';
    const objectName = `${userId}/${randomUUID()}.${ext}`;
    let proxyPath: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await put(`payment-proofs/${objectName}`, file, {
        access: 'private',
        addRandomSuffix: false,
        contentType: mime,
      });
      proxyPath = `/api/admin/cs/payment-proof/${objectName}`;
    } else {
      const dir = path.join('/tmp', 'uploads', 'payment-proofs', userId);
      await fs.mkdir(dir, { recursive: true });
      localPath = path.join(dir, `${randomUUID()}.${ext}`);
      await fs.writeFile(localPath, Buffer.from(await file.arrayBuffer()));
      proxyPath = `/api/admin/cs/payment-proof/${userId}/${path.basename(localPath)}`;
    }

    const reference = referenceInput || `WAT-TRF-${Date.now()}-${randomUUID().slice(0, 8).toUpperCase()}`;

    let payment;
    try {
      payment = await db.onboardingPayment.create({
        data: {
          userId,
          amount,
          method: 'transfer',
          status: 'pending',
          reference,
          proofOfPaymentPath: proxyPath,
        },
      });
    } catch (e) {
      if (localPath) await fs.unlink(localPath).catch(() => {});
      throw e;
    }

    try {
      const csStaff = await db.admin.findMany({
        where: { role: 'cs', status: 1, csPaymentVerify: true },
        select: { id: true },
      });
      const { createNotification } = await import('@/lib/notifications');
      await Promise.all(csStaff.map(cs => createNotification({
        adminId: cs.id,
        type: 'payment_verification_request',
        title: 'New Manual Payment — Verification Needed',
        message: `A customer has uploaded proof of payment for the CAC search fee (₦${amount.toLocaleString()}). Please verify.`,
        category: 'payment',
        actionLabel: 'Verify Payment',
        actionView: 'cs-payment-verification',
      })));
    } catch {}

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      message: 'Proof of payment uploaded. Customer Service will verify your payment shortly.',
    });
  } catch (e: any) {
    if (localPath) await fs.unlink(localPath).catch(() => {});
    console.error('[ONBOARDING PAYMENT UPLOAD] error:', e);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
