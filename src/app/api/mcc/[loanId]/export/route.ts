import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { MCC_ROLES, ROLE_TO_MCC, LOAN_STATUS_LABELS, LOAN_STEP_LABELS } from '@/lib/constants';

// ============================================================================
// MCC EXPORT — server-side JSON payload for PDF rendering on the client.
// Returns the same MCC paper data plus a serialised snapshot suitable for
// @react-pdf/renderer download in the browser.
// ============================================================================
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ loanId: string }> }
) {
  try {
    const { loanId } = await params;

    const loan = await db.loanApplicants.findUnique({
      where: { id: loanId },
      include: {
        user: { include: { business: true } },
        branch: true,
        plan: true,
        loanOfficer: true,
        mccDecisions: {
          orderBy: [{ approvalLevel: 'asc' }, { decisionDate: 'asc' }],
          include: { approver: true },
        },
      },
    });

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }

    const safeUser = loan.user ? { ...loan.user, password: undefined } : null;
    const safeLoanOfficer = loan.loanOfficer
      ? { ...loan.loanOfficer, password: undefined }
      : null;
    const decisions = (loan.mccDecisions || []).map((d: any) => ({
      ...d,
      approver: d.approver ? { ...d.approver, password: undefined } : null,
    }));

    const TOTAL_MCC_LEVELS = Object.keys(MCC_ROLES).length;
    const initialAmount = loan.amount || 0;
    const lastDecision = decisions.length > 0 ? decisions[decisions.length - 1] : null;
    const finalAmount =
      lastDecision?.recommendedAmount ?? loan.finalAmount ?? loan.approvedAmount ?? initialAmount;
    const amountChange = (finalAmount || 0) - initialAmount;
    const amountChangePercent =
      initialAmount > 0
        ? Number((((finalAmount || 0) - initialAmount) / initialAmount) * 100)
        : 0;
    const decisionCount = decisions.length;
    const progressPercent = Math.round((decisionCount / TOTAL_MCC_LEVELS) * 100);
    const isComplete = decisionCount >= TOTAL_MCC_LEVELS;

    const latestWithRates = [...decisions]
      .reverse()
      .find(
        (d) =>
          d.ccdPercentage != null ||
          d.interestRatePercentage != null ||
          d.upfrontFeePercentage != null
      );

    const latestRates = latestWithRates
      ? {
          ccd: latestWithRates.ccdPercentage ?? loan.finalCcdFeePercent ?? null,
          upfront: latestWithRates.upfrontFeePercentage ?? loan.finalUpfrontFeePercent ?? null,
          interest: latestWithRates.interestRatePercentage ?? loan.finalInterestRate ?? loan.percent ?? null,
        }
      : {
          ccd: loan.finalCcdFeePercent ?? null,
          upfront: loan.finalUpfrontFeePercent ?? null,
          interest: loan.finalInterestRate ?? loan.percent ?? null,
        };

    // PDF-friendly flat payload (string dates) so the client doesn't need to refetch
    const payload = {
      loan: {
        id: loan.id,
        applicationRef: loan.applicationRef,
        reason: loan.reason,
        repaymentPlan: loan.repaymentPlan,
        amount: loan.amount,
        duration: loan.duration,
        createdAt: loan.createdAt,
        updatedAt: loan.updatedAt,
        status: loan.status,
        statusLabel: LOAN_STATUS_LABELS[loan.status] || loan.status,
        currentStep: loan.currentStep,
        currentStepLabel: LOAN_STEP_LABELS[loan.currentStep] || loan.currentStep,
        user: safeUser,
        branch: loan.branch,
        plan: loan.plan,
        loanOfficer: safeLoanOfficer,
      },
      decisions: decisions.map((d: any) => ({
        id: d.id,
        approvalLevel: d.approvalLevel,
        approverName: d.approverName,
        approverRole: d.approverRole,
        recommendedAmount: d.recommendedAmount,
        duration: d.duration,
        ccdPercentage: d.ccdPercentage,
        upfrontFeePercentage: d.upfrontFeePercentage,
        interestRatePercentage: d.interestRatePercentage,
        comment: d.comment,
        decisionType: d.decisionType,
        decisionDate: d.decisionDate,
      })),
      summary: {
        initialAmount,
        finalAmount,
        amountChange,
        amountChangePercent: Number(amountChangePercent.toFixed(2)),
        progressPercent,
        decisionCount,
        totalLevels: TOTAL_MCC_LEVELS,
        isComplete,
        latestRates,
        latestDecisionType: lastDecision?.decisionType ?? null,
        latestDecisionDate: lastDecision?.decisionDate ?? null,
      },
      generatedAt: new Date().toISOString(),
    };

    return NextResponse.json(payload);
  } catch (e: any) {
    console.error('MCC export API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
