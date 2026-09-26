import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';

/**
 * GET /api/customer/onboarding-payment/status?userId=xxx
 * Returns the user's current payment status + the CAC search fee amount
 */
export async function GET(req: NextRequest) {
  // v51 — customer auth gate: identity derived from JWT, NOT body.userId.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    // v53-IDOR-fix: userId from JWT, not query string.
    const userId = authPayload_v51.id;

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        onboardingStage: true,
        accountNumberStatus: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Get the CAC search fee from SystemSetting
    const feeSetting = await db.systemSetting.findUnique({
      where: { key: 'fee_cac_search' },
    });
    const feeAmount = feeSetting && feeSetting.active !== false
      ? Number(feeSetting.value)
      : 5000; // default ₦5,000

    // Get the user's onboarding payment (if any)
    const payments = await db.onboardingPayment.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 5,
    });

    const latestPayment = payments[0] || null;
    const hasPendingPayment = payments.some(p => p.status === 'pending');
    const hasConfirmedPayment = payments.some(p => p.status === 'confirmed');

    return NextResponse.json({
      user: {
        onboardingStage: user.onboardingStage,
        accountNumberStatus: user.accountNumberStatus,
      },
      fee: {
        amount: feeAmount,
        label: feeSetting?.label || 'CAC Name Search Fee',
      },
      payment: latestPayment,
      paymentHistory: payments,
      hasPendingPayment,
      hasConfirmedPayment,
      needsPayment: user.onboardingStage === 'payment_pending' && !hasConfirmedPayment,
    });
  } catch (e: any) {
    console.error('[ONBOARDING PAYMENT STATUS] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
