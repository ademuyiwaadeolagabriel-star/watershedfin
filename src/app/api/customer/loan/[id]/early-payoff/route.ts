import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule, calculateEarlyPayoff, applyPaymentsToSchedule } from '@/lib/loan-calc';

// GET /api/customer/loan/[id]/early-payoff?userId=
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
      include: { loanTransactions: { orderBy: { transactionDate: 'asc' } } },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (userId && loan.userId !== userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    if (loan.status !== 'running') return NextResponse.json({ error: 'Loan is not active' }, { status: 400 });

    const principal = loan.finalAmount || loan.approvedAmount || loan.amount;
    const tenorMonths = loan.finalTenure || loan.approvedTenor || loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || 24;
    const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || new Date();

    const calc = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, startDate);
    const totalPaid = loan.loanTransactions
      .filter((t: any) => t.type === 'repayment')
      .reduce((s: number, t: any) => s + t.amount, 0);

    const scheduleWithPayments = applyPaymentsToSchedule(calc.schedule, totalPaid, new Date());
    const currentMonth = scheduleWithPayments.filter(s => s.status === 'paid').length;

    // Early payoff with 2% penalty on remaining interest
    const payoff = calculateEarlyPayoff(scheduleWithPayments, currentMonth, 2);

    return NextResponse.json({
      currentMonth,
      totalMonths: tenorMonths,
      monthsRemaining: tenorMonths - currentMonth,
      ...payoff,
      payoffDate: new Date(),
      originalMaturityDate: new Date(startDate.setMonth(startDate.getMonth() + tenorMonths)),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
