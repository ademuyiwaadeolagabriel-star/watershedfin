import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCC_ROLES } from '@/lib/constants';

// GET /api/customer/loan/[id]/decision?userId=
// Returns the 8-gate decision timeline (customer-facing, sanitized)
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: {
        mccDecisions: { orderBy: { approvalLevel: 'asc' }, include: { approver: true } },
        approvalLogs: { orderBy: { createdAt: 'asc' }, include: { admin: true } },
        appraisal: true,
      },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (userId && loan.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // Build the 8-gate chain
    const allGates = [
      { level: 1, code: 'LO', label: 'Loan Officer', step: 'LO_ASSESSMENT' },
      { level: 2, code: 'BM', label: 'Branch Manager', step: 'BM_QC' },
      { level: 3, code: 'CA', label: 'Credit Analyst', step: 'ANALYST_STRUCTURING' },
      { level: 4, code: 'HOC', label: 'Head of Credit', step: 'HOC_APPROVAL' },
      { level: 5, code: 'CRO', label: 'Chief Risk Officer', step: 'CRO_RISK' },
      { level: 6, code: 'LEGAL', label: 'Legal Department', step: 'LEGAL_FINAL_REVIEW' },
      { level: 7, code: 'GCFO', label: 'Group CFO', step: 'CFO_REVIEW' },
      { level: 8, code: 'MD', label: 'MD / CEO', step: 'MD_APPROVAL' },
    ];

    // Map decisions by level
    const decisionsByLevel: Record<number, any> = {};
    loan.mccDecisions.forEach((d: any) => {
      decisionsByLevel[d.approvalLevel] = {
        ...d,
        approver: d.approver ? { ...d.approver, password: undefined } : null,
      };
    });

    // Map approval logs by action type for timestamps
    const timeline = allGates.map(gate => {
      const decision = decisionsByLevel[gate.level];
      const isCurrent = loan.currentStep === gate.step;
      // Determine if this gate is "passed" — either has a decision OR the current step is past this gate
      const allSteps = ['DRAFT', 'LO_ENTRY', 'LO_ASSESSMENT', 'LEGAL_CAC_CHECK', 'BM_QC', 'HOC_STRUCTURING', 'ANALYST_STRUCTURING', 'HOC_APPROVAL', 'CRO_VERIFICATION', 'CRO_RISK', 'CFO_REVIEW', 'LEGAL_REVIEW', 'LEGAL_FINAL_REVIEW', 'HOC_AGGREGATION', 'MD_APPROVAL', 'HOC_FINALIZATION', 'CUSTOMER_ACCEPTANCE', 'HOC_SCHEDULING', 'CFO_DISBURSEMENT', 'TREASURY_PAYOUT'];
      const currentIdx = allSteps.indexOf(loan.currentStep);
      const gateIdx = allSteps.indexOf(gate.step);
      const isPast = currentIdx > gateIdx;
      const isPending = !decision && isCurrent;

      return {
        level: gate.level,
        code: gate.code,
        label: gate.label,
        step: gate.step,
        status: decision ? 'decided' : isPast ? 'passed' : isCurrent ? 'current' : 'pending',
        decision: decision ? {
          approverName: decision.approverName,
          approverRole: decision.approverRole,
          recommendedAmount: decision.recommendedAmount,
          duration: decision.duration,
          interestRate: decision.interestRatePercentage,
          ccdPercentage: decision.ccdPercentage,
          comment: decision.comment,
          decisionType: decision.decisionType,
          decisionDate: decision.decisionDate,
        } : null,
      };
    });

    // Count completed
    const completedCount = timeline.filter(t => t.status === 'decided' || t.status === 'passed').length;
    const progressPercent = (completedCount / 8) * 100;

    // Approval logs for the activity feed
    const logs = loan.approvalLogs.map((l: any) => ({
      ...l,
      admin: l.admin ? { ...l.admin, password: undefined } : null,
    }));

    return NextResponse.json({
      loan: {
        id: loan.id,
        applicationRef: loan.applicationRef,
        currentStep: loan.currentStep,
        status: loan.status,
        amount: loan.amount,
        finalAmount: loan.finalAmount,
        submittedAt: loan.submittedAt,
        disbursedAt: loan.disbursedAt,
      },
      timeline,
      completedCount,
      totalGates: 8,
      progressPercent,
      logs,
      isComplete: completedCount >= 8,
      estimatedTimeRemaining: completedCount >= 8 ? 'Completed' : completedCount >= 4 ? '1-2 business days' : '3-5 business days',
    });
  } catch (e: any) {
    console.error('Decision timeline error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
