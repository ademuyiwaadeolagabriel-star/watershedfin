import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth } from '@/lib/auth';
import { db } from '@/lib/db';
import { calculateLoanSchedule, applyPaymentsToSchedule, computeLoanProgress } from '@/lib/loan-calc';

// GET /api/customer/loan/[id]/breakdown?userId=
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v51 — customer auth gate: identity derived from JWT, NOT body.userId.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const userId = authPayload_v51.id; // v53 - derived from JWT

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: {
        user: { include: { business: true } },
        plan: true,
        branch: true,
        loanOfficer: true,
        appraisal: true,
        mccDecisions: { orderBy: { approvalLevel: 'asc' }, include: { approver: true } },
        approvalLogs: { orderBy: { createdAt: 'asc' }, include: { admin: true } },
        loanRepayments: { orderBy: { dueDate: 'asc' } },
        loanTransactions: { orderBy: { transactionDate: 'desc' } },
      },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (userId && loan.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });

    // v51 — Decimal arithmetic: wrap each Decimal field with Number()
    // so the resulting values are plain numbers (not number | Decimal).
    const principal = Number(loan.finalAmount) || Number(loan.vettedAmount) || Number(loan.approvedAmount) || Number(loan.amount);
    const tenorMonths = Number(loan.finalTenure) || Number(loan.vettedDuration) || Number(loan.approvedTenor) || Number(loan.duration);
    const annualRate = Number(loan.finalInterestRate) || Number(loan.percent) || Number(loan.plan?.interest || 0); // v53-P3: removed || 24 fallback
      if (annualRate == null || isNaN(Number(annualRate))) {
        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });
      }
    const ccdPercent = Number(loan.finalCcdFeePercent); // v53-P3: removed || 10 fallback
      if (ccdPercent == null || isNaN(Number(ccdPercent))) {
        return NextResponse.json({ error: "Loan is missing finalCcdFeePercent." }, { status: 400 });
      }
    const upfrontFeePercent = Number(loan.finalUpfrontFeePercent); // v53-P3: removed || 1 fallback
      if (upfrontFeePercent == null || isNaN(Number(upfrontFeePercent))) {
        return NextResponse.json({ error: "Loan is missing finalUpfrontFeePercent." }, { status: 400 });
      }
    const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || loan.disbursementDate || new Date();

    const calculation = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, startDate, ccdPercent, upfrontFeePercent, 0);

    const totalPaid = loan.loanTransactions
      .filter((t: any) => t.type === 'repayment')
      .reduce((sum: number, t: any) => sum + t.amount, 0);

    const scheduleWithPayments = applyPaymentsToSchedule(calculation.schedule, totalPaid, new Date());
    const progress = computeLoanProgress(scheduleWithPayments, totalPaid);

    const safe: any = {
      ...loan,
      user: loan.user ? { ...loan.user, password: undefined } : null,
      loanOfficer: loan.loanOfficer ? { ...loan.loanOfficer, password: undefined } : null,
      mccDecisions: loan.mccDecisions.map((d: any) => ({ ...d, approver: d.approver ? { ...d.approver, password: undefined } : null })),
      approvalLogs: loan.approvalLogs.map((l: any) => ({ ...l, admin: l.admin ? { ...l.admin, password: undefined } : null })),
    };

    return NextResponse.json({
      loan: safe,
      calculation: { ...calculation, schedule: scheduleWithPayments },
      progress,
      totalPaid,
      summary: {
        principal, tenorMonths, annualRate,
        monthlyInstallment: calculation.monthlyInstallment,
        totalRepayment: calculation.totalRepayment,
        totalInterest: calculation.totalInterest,
        ccdAmount: calculation.ccdAmount,
        upfrontFeeAmount: calculation.upfrontFeeAmount,
        netDisbursement: calculation.netDisbursement,
        totalCostOfCredit: calculation.totalCostOfCredit,
        effectiveAPR: calculation.effectiveAPR,
        outstandingBalance: progress.outstandingBalance,
        nextDue: progress.nextDue,
        paidCount: progress.paidCount,
        overdueCount: progress.overdueCount,
        progressPercent: progress.progressPercent,
      },
    });
  } catch (e: any) {
    console.error('Loan breakdown error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
