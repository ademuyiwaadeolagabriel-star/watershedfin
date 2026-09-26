import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import crypto from 'crypto';

/**
 * POST /api/customer/onboarding-payment/initiate
 * Authorization: Bearer <customer-jwt>
 *
 * Initiates a Paystack payment for the CAC search fee.
 *
 * v50 FIX (Issue #7): Customer identity comes from the JWT, NOT from
 * `body.userId`. The previous implementation accepted any userId,
 * allowing a customer authenticated as themselves to initiate
 * Paystack payment flows on behalf of another customer — polluting
 * that customer's onboarding stage.
 *
 * v50: Payment reference generation moved to crypto.randomBytes for
 * non-guessable refs.
 */
export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id;

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

    // v50 — cryptographically secure reference.
    const reference = `WAT-CAC-${Date.now()}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;

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
