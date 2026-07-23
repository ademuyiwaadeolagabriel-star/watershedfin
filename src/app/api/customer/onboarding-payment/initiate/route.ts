import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/customer/onboarding-payment/initiate
 * Initiates a Paystack payment for the CAC search fee.
 * Body: { userId }
 *
 * Returns: { reference, amount, email, publicKey }
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, phone: true, firstName: true, onboardingStage: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.onboardingStage !== 'payment_pending' && user.onboardingStage !== 'kyc_approved') {
      return NextResponse.json({
        error: 'Payment is not required at this stage. Current stage: ' + user.onboardingStage,
      }, { status: 400 });
    }

    // Get the CAC search fee
    const feeSetting = await db.systemSetting.findUnique({
      where: { key: 'fee_cac_search' },
    });
    const amount = feeSetting && feeSetting.active !== false
      ? Number(feeSetting.value)
      : 5000;

    // Generate a unique reference
    const reference = `WAT-CAC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // Create a pending OnboardingPayment record
    const payment = await db.onboardingPayment.create({
      data: {
        userId,
        amount,
        method: 'paystack',
        status: 'pending',
        reference,
      },
    });

    return NextResponse.json({
      paymentId: payment.id,
      reference,
      amount,
      amountInKobo: amount * 100, // Paystack requires kobo
      email: user.email || `${user.id}@watershed.placeholder`,
      publicKey: process.env.NEXT_PUBLIC_PAYSTACK_PUBLIC_KEY || '',
    });
  } catch (e: any) {
    console.error('[ONBOARDING PAYMENT INITIATE] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
