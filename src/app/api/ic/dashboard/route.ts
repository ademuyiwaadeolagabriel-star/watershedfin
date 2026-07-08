import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const now = new Date();
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const [
      pendingConditions,
      overdue,
      pendingDocs,
      verifiedToday,
      pendingChecklists,
      clearedToday,
      criticalRisks,
      openExceptions,
    ] = await Promise.all([
      db.complianceCondition.count({
        where: { status: { in: ['pending', 'document_uploaded', 'under_review', 'customer_notified'] } },
      }),
      db.complianceCondition.count({
        where: { deadline: { lt: now }, status: { notIn: ['verified', 'rejected', 'waived', 'expired'] } },
      }),
      db.user.count({ where: { OR: [{ docPassportPath: null }, { docIdCardPath: null }] } }),
      db.complianceCondition.count({
        where: { status: 'verified', verifiedAt: { gte: today } },
      }),
      db.preDisbursementChecklist.count({
        where: { status: { in: ['pending', 'in_progress', 'completed'] } },
      }),
      db.preDisbursementChecklist.count({
        where: { status: 'disbursement_approved', approvedAt: { gte: today } },
      }),
      db.riskAssessment.count({ where: { inherentRiskRating: 'critical', status: { not: 'closed' } } }),
      db.exceptionReport.count({ where: { status: { in: ['open', 'under_review', 'escalated'] } } }),
    ]);

    return NextResponse.json({
      pendingConditions,
      overdue,
      pendingDocs,
      verifiedToday,
      pendingChecklists,
      clearedToday,
      criticalRisks,
      openExceptions,
    });
  } catch (e: any) {
    console.error('IC dashboard API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
