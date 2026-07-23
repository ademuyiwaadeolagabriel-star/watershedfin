import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { KYC_STATUSES } from '@/lib/constants';

/**
 * GET /api/admin/kyc
 * v38: Now queries BOTH kycStatus AND onboardingStage.
 * Shows users who are:
 *   - kycStatus IN ('PROCESSING', 'RESUBMIT') — legacy KYC flow
 *   - onboardingStage = 'cs_kyc_review' — v26+ onboarding flow
 */
export async function GET(_req: NextRequest) {
  try {
    const where = {
      OR: [
        { kycStatus: { in: [KYC_STATUSES.PROCESSING, KYC_STATUSES.RESUBMIT] } },
        { onboardingStage: 'cs_kyc_review' },
      ],
    };

    const [users, pending, approved, declined, resubmit, total] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          bvn: true,
          nin: true,
          kycStatus: true,
          onboardingStage: true,
          accountNumberStatus: true,
          createdAt: true,
          updatedAt: true,
          business: {
            select: {
              id: true,
              name: true,
              docFront: true,
              docBack: true,
              proofOfAddress: true,
              selfie: true,
              docShopPhoto: true,
              docCac: true,
              docType: true,
              docNumber: true,
              sourceOfFunds: true,
              businessType: true,
              line1: true,
              line2: true,
              city: true,
              state: true,
              country: true,
              postalCode: true,
              bDay: true,
              bMonth: true,
              bYear: true,
              declineReason: true,
            },
          },
        },
        orderBy: { updatedAt: 'desc' },
      }),
      db.user.count({ where: { OR: [{ kycStatus: KYC_STATUSES.PROCESSING }, { onboardingStage: 'cs_kyc_review' }] } }),
      db.user.count({ where: { kycStatus: KYC_STATUSES.APPROVED } }),
      db.user.count({ where: { kycStatus: KYC_STATUSES.DECLINED } }),
      db.user.count({ where: { kycStatus: KYC_STATUSES.RESUBMIT } }),
      db.user.count({ where: { kycStatus: { not: null } } }),
    ]);

    return NextResponse.json({
      users,
      stats: {
        pending,
        approved,
        declined,
        resubmit,
        total,
      },
    });
  } catch (e: any) {
    console.error('KYC list API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
