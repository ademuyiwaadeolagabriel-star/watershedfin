import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule, applyPaymentsToSchedule, computeLoanProgress } from '@/lib/loan-calc';

// GET /api/customer/loan/[id]/breakdown?userId=
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

    const principal = loan.finalAmount || loan.vettedAmount || loan.approvedAmount || loan.amount;
    const tenorMonths = loan.finalTenure || loan.vettedDuration || loan.approvedTenor || loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || loan.plan?.interest || 24;
    const ccdPercent = loan.finalCcdFeePercent || 10;
    const upfrontFeePercent = loan.finalUpfrontFeePercent || 1;
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
