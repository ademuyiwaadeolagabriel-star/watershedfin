import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { calculateLoanSchedule, calculateEarlyPayoff, applyPaymentsToSchedule } from '@/lib/loan-calc';
import { requireCustomerAuth } from '@/lib/auth';

// v50 — Customer identity now derived from the JWT, NOT from query string.
// This eliminates the IDOR risk where Customer A could request the early
// payoff details for Customer B's loan by passing userId=A while authenticated
// as Customer B.
//
// GET /api/customer/loan/[id]/early-payoff
// Authorization: Bearer <customer-jwt>
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // --- Auth gate: customer JWT mandatory -----------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };

    const { id } = await params;

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: { loanTransactions: { orderBy: { transactionDate: 'asc' } } },
    });

    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // v50 — IDOR fix: the loan's owner MUST be the authenticated customer.
    // The previous implementation accepted ?userId=... from the URL, allowing
    // any authenticated customer to query any other customer's loan payoff
    // quote simply by omitting (or changing) the userId query parameter.
    if (loan.userId !== authPayload.id) {
      return NextResponse.json({ error: 'Forbidden: loan does not belong to authenticated customer.' }, { status: 403 });
    }
    if (loan.status !== 'running') return NextResponse.json({ error: 'Loan is not active' }, { status: 400 });

    const principal = Number(loan.finalAmount) || Number(loan.approvedAmount) || Number(loan.amount);
    const tenorMonths = loan.finalTenure || loan.approvedTenor || loan.duration;
    const annualRate = Number(loan.finalInterestRate) || loan.percent; // v53-P3: removed || 24 fallback
      if (annualRate == null || isNaN(Number(annualRate))) {
        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });
      }
    const repaymentMethod = (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || new Date();

    const calc = calculateLoanSchedule(principal, annualRate, tenorMonths, repaymentMethod, startDate);
    const totalPaid = loan.loanTransactions
      .filter((t: any) => t.type === 'repayment')
      .reduce((s: number, t: any) => s + t.amount, 0);

    const scheduleWithPayments = applyPaymentsToSchedule(calc.schedule, totalPaid, new Date());
    const currentMonth = scheduleWithPayments.filter(s => s.status === 'paid').length;

    // Early payoff with 2% penalty on remaining interest.
    // v50 — note (Issue #19): the source of truth for outstanding principal
    // should eventually be the loan ledger (LoanRepayment + LoanTransaction).
    // For now we reconstruct from the amortization schedule, which is correct
    // as long as the schedule and ledger are kept in sync at payment time.
    // TODO(v51): replace schedule reconstruction with authoritative ledger read.
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
