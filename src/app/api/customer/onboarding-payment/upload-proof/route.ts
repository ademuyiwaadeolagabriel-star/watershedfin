import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';

/**
 * POST /api/customer/onboarding-payment/upload-proof
 * Customer uploads proof of payment for manual bank transfer.
 * Body: FormData { userId, reference, file }
 *
 * Saves the file to /public/payments/ and creates an OnboardingPayment record
 * with status 'pending' for CS to verify.
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const userId = formData.get('userId') as string;
    const reference = formData.get('reference') as string || `WAT-TRF-${Date.now()}`;
    const file = formData.get('file') as File;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!file) {
      return NextResponse.json({ error: 'Proof of payment file is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, onboardingStage: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the CAC search fee
    const feeSetting = await db.systemSetting.findUnique({
      where: { key: 'fee_cac_search' },
    });
    const amount = feeSetting && feeSetting.active !== false
      ? Number(feeSetting.value)
      : 5000;

    // Save the file
    const ext = file.name.split('.').pop() || 'jpg';
    const fileName = `proof-${userId}-${Date.now()}.${ext}`;
    const filePath = `/payments/${fileName}`;
    const absolutePath = path.join(process.cwd(), 'public', 'payments', fileName);

    // Create directory if it doesn't exist
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    const buffer = Buffer.from(await file.arrayBuffer());
    await fs.writeFile(absolutePath, buffer);

    // Create OnboardingPayment record with status 'pending'
    const payment = await db.onboardingPayment.create({
      data: {
        userId,
        amount,
        method: 'transfer',
        status: 'pending',
        reference,
        proofOfPaymentPath: filePath,
      },
    });

    // Notify CS staff that a manual payment needs verification
    try {
      const csStaff = await db.admin.findMany({
        where: { role: 'cs', status: 1, csPaymentVerify: true },
        select: { id: true },
      });
      const { createNotification } = await import('@/lib/notifications');
      await Promise.all(csStaff.map(cs =>
        createNotification({
          adminId: cs.id,
          type: 'payment_verification_request',
          title: 'New Manual Payment — Verification Needed',
          message: `A customer has uploaded proof of payment for the CAC search fee (₦${amount.toLocaleString()}). Please verify.`,
          category: 'payment',
          actionLabel: 'Verify Payment',
          actionView: 'cs-payment-verification',
        })
      ));
    } catch (e) {
      // non-blocking
    }

    return NextResponse.json({
      ok: true,
      paymentId: payment.id,
      message: 'Proof of payment uploaded. Customer Service will verify your payment shortly.',
    });
  } catch (e: any) {
    console.error('[ONBOARDING PAYMENT UPLOAD] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
