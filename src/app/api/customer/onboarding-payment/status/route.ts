import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/customer/onboarding-payment/status?userId=xxx
 * Returns the user's current payment status + the CAC search fee amount
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
