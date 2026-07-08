import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { KYC_STATUSES } from '@/lib/constants';

export async function GET() {
  try {
    // KYC stats by kycStatus on User
    const kycStats: Record<string, number> = {};
    for (const s of Object.values(KYC_STATUSES)) {
      kycStats[s] = await db.user.count({ where: { kycStatus: s } });
    }
    const unverified = await db.user.count({
      where: { OR: [{ kycStatus: null }, { kycStatus: '' }, { kycStatus: 'DRAFT' }] },
    });

    // Missing docs stats — derive from User doc paths (passport, id card, guarantor form)
    const [missingPassport, missingId, missingGuarantor, missingUtility] = await Promise.all([
      db.user.count({ where: { OR: [{ docPassportPath: null }, { docPassportPath: '' }] } }),
      db.user.count({ where: { OR: [{ docIdCardPath: null }, { docIdCardPath: '' }] } }),
      db.user.count({ where: { OR: [{ guarantorFormPath: null }, { guarantorFormPath: '' }] } }),
      db.user.count({ where: { OR: [{ address: null }, { address: '' }] } }),
    ]);

    const missingDocStats = {
      missing_passport: missingPassport,
      missing_id: missingId,
      missing_guarantor_form: missingGuarantor,
      missing_utility_bill: missingUtility,
    };

    // Policy acknowledgment rate
    const [policiesCount, staffCount, ackCount] = await Promise.all([
      db.policyDocument.count({ where: { status: 'active' } }),
      db.admin.count({ where: { status: 1 } }),
      db.policyAcknowledgment.count(),
    ]);
    const expected = policiesCount * staffCount;
    const policyAckRate = expected > 0 ? Math.round((ackCount / expected) * 100) : 0;

    // Recent approvals / declines (audit logs on KYC module)
    const [recentApprovals, recentDeclines] = await Promise.all([
      db.auditLog.findMany({
        where: { module: 'kyc', action: { in: ['approved', 'verified'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, username: true } },
        },
      }),
      db.auditLog.findMany({
        where: { module: 'kyc', action: { in: ['rejected', 'declined'] } },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, username: true } },
        },
      }),
    ]);

    // Conditions summary
    const [pendingConditions, overdueConditions] = await Promise.all([
      db.complianceCondition.count({ where: { status: { in: ['pending', 'document_uploaded', 'under_review', 'customer_notified'] } } }),
      db.complianceCondition.count({
        where: {
          deadline: { lt: new Date() },
          status: { notIn: ['verified', 'rejected', 'waived', 'expired'] },
        },
      }),
    ]);

    return NextResponse.json({
      kycStats,
      unverified,
      missingDocStats,
      policyAckRate,
      ackCount,
      expectedAcknowledgments: expected,
      policiesCount,
      staffCount,
      recentApprovals,
      recentDeclines,
      pendingConditions,
      overdueConditions,
    });
  } catch (e: any) {
    console.error('Compliance monitoring API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
