import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import crypto from 'crypto';
import { Prisma } from '@prisma/client';

export async function POST(req: NextRequest) {
  try {
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const userId = (authResult as { id: string }).id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, onboardingStage: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    if (!['payment_pending', 'kyc_approved'].includes(user.onboardingStage)) {
      return NextResponse.json({
        error: `Payment is not required at this stage. Current stage: ${user.onboardingStage}`,
      }, { status: 400 });
    }

    const feeSetting = await db.systemSetting.findUnique({ where: { key: 'fee_cac_search' } });
    const amount = feeSetting && feeSetting.active !== false ? Number(feeSetting.value) : 5000;
    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'CAC fee is not configured correctly.' }, { status: 500 });
    }

    const result = await db.$transaction(async (tx) => {
      const existing = await tx.onboardingPayment.findFirst({
        where: { userId, status: 'pending' },
        orderBy: { createdAt: 'desc' },
      });
      if (existing) return { payment: existing, idempotent: true };

      const reference = `WAT-CAC-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
      const payment = await tx.onboardingPayment.create({
        data: { userId, amount, method: 'paystack', status: 'pending', reference },
      });
      return { payment, idempotent: false };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 10000,
    });

    let checkoutUrl: string | null = null;
    let accessCode: string | null = null;

    if (process.env.NODE_ENV === 'production' && !result.payment.gatewayUrl) {
      const secret = process.env.PAYSTACK_SECRET_KEY;
      if (!secret || !user.email) {
        return NextResponse.json({ error: !secret ? 'Paystack is not configured on the server.' : 'A valid customer email is required for Paystack.' }, { status: 503 });
      }
      const gatewayRes = await fetch('https://api.paystack.co/transaction/initialize', {
        method: 'POST',
        headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: user.email,
          amount: String(Math.round(Number(result.payment.amount) * 100)),
          currency: 'NGN',
          reference: result.payment.reference,
          channels: ['card', 'bank_transfer', 'ussd'],
          callback_url: process.env.PAYSTACK_CALLBACK_URL || `${process.env.NEXT_PUBLIC_BASE_URL || ''}/?view=customer-dashboard`,
          metadata: JSON.stringify({
            onboardingPaymentId: result.payment.id,
            type: 'cac_onboarding',
            userId,
          }),
        }),
      });
      const gateway = await gatewayRes.json().catch(() => null);
      if (!gatewayRes.ok || !gateway?.status || !gateway?.data?.authorization_url) {
        return NextResponse.json({ error: 'Unable to initialize Paystack payment.' }, { status: 502 });
      }
      checkoutUrl = gateway.data.authorization_url;
      accessCode = gateway.data.access_code || null;
      await db.onboardingPayment.update({
        where: { id: result.payment.id },
        data: { gatewayUrl: checkoutUrl, gatewayAccessCode: accessCode },
      });
    } else {
      checkoutUrl = result.payment.gatewayUrl || null;
      accessCode = result.payment.gatewayAccessCode || null;
    }

    return NextResponse.json({
      paymentId: result.payment.id,
      reference: result.payment.reference,
      amount: Number(result.payment.amount),
      amountInKobo: Math.round(Number(result.payment.amount) * 100),
      email: user.email || `${user.id}@watershed.placeholder`,
      publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
      checkoutUrl,
      accessCode,
      idempotent: result.idempotent,
    });
  } catch (e: any) {
    console.error('[ONBOARDING PAYMENT INITIATE] error:', e);
    return NextResponse.json({ error: 'Could not initiate CAC payment.' }, { status: 500 });
  }
}
