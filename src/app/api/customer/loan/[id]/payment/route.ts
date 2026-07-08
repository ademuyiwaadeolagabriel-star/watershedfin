import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTemplatedNotification } from '@/lib/notification-templates';
import { checkPaymentBadges, checkLoanCompletionBadges } from '@/lib/gamification';

// POST /api/customer/loan/[id]/payment
// Body: { userId, amount, paymentMethod, reference }
//
// Records a repayment transaction, fires a `payment_received` notification
// (email + SMS, fire-and-forget), stores the receipt metadata on the
// LoanTransaction row, and returns everything the client needs to render +
// download the PDF receipt.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, amount, paymentMethod, reference } = await req.json();

    if (!userId || !amount || amount <= 0) {
      return NextResponse.json(
        { error: 'userId and valid amount required' },
        { status: 400 },
      );
    }

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    if (loan.userId !== userId)
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
    if (loan.status !== 'running') {
      return NextResponse.json(
        { error: 'Loan is not active. Payments can only be made on running loans.' },
        { status: 400 },
      );
    }

    // Generate reference if not provided
    const paymentRef =
      reference || `PMT-${loan.applicationRef}-${Date.now().toString().slice(-6)}`;

    // Pre-compute outstanding balance AFTER this payment so we can stamp it on
    // the receipt metadata and include it in the customer notification.
    const priorRepayments = await db.loanTransaction.findMany({
      where: { loanApplicantId: id, type: 'repayment' },
    });
    const priorPaid = priorRepayments.reduce((s, t) => s + t.amount, 0);

    // Outstanding balance = (total loan repayment including this payment) subtracted
    // from total owed. We compute total owed from the loan terms to avoid
    // requiring persisted LoanRepayment rows.
    const principal =
      loan.finalAmount ||
      loan.vettedAmount ||
      loan.approvedAmount ||
      loan.amount;
    const tenorMonths =
      loan.finalTenure ||
      loan.vettedDuration ||
      loan.approvedTenor ||
      loan.duration;
    const annualRate = loan.finalInterestRate || loan.percent || 24;
    const repaymentMethod =
      (loan.repaymentPlan as 'REDUCING' | 'FLAT') || 'REDUCING';
    const startDate = loan.disbursedAt || loan.disbursementDate || new Date();
    const { calculateLoanSchedule, applyPaymentsToSchedule, computeLoanProgress } =
      await import('@/lib/loan-calc');
    const calc = calculateLoanSchedule(
      principal,
      annualRate,
      tenorMonths,
      repaymentMethod,
      startDate,
      0,
      0,
      0,
    );
    const newTotalPaid = priorPaid + Number(amount);
    const scheduleWithPayments = applyPaymentsToSchedule(
      calc.schedule,
      newTotalPaid,
      new Date(),
    );
    const progress = computeLoanProgress(scheduleWithPayments, newTotalPaid);
    const outstandingBalance = Math.max(0, progress.outstandingBalance);
    const nextDueDate = progress.nextDue?.dueDate || null;
    const nextDueAmount = progress.nextDue?.installment ?? null;

    // Receipt number — short, human-readable, deterministic per payment.
    const receiptNumber = `RCP-${(loan.applicationRef || id).slice(-6).toUpperCase()}-${Date.now().toString().slice(-6).toUpperCase()}`;

    // Create loan transaction with embedded receipt metadata
    const transaction = await db.loanTransaction.create({
      data: {
        loanApplicantId: id,
        type: 'repayment',
        amount: Number(amount),
        reference: paymentRef,
        transactionDate: new Date(),
        metadata: JSON.stringify({
          paymentMethod: paymentMethod || 'bank_transfer',
          userId,
          receiptNumber,
          outstandingBalance,
          nextDueDate: nextDueDate ? new Date(nextDueDate).toISOString() : null,
          nextDueAmount,
        }),
      },
    });

    // Also create a general transaction record
    await db.transactions.create({
      data: {
        userId,
        type: 'loan_repaid',
        amount: Number(amount),
        charge: 0,
        status: 'success',
        reference: paymentRef,
        trxRef: loan.applicationRef,
      },
    });

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'created',
        module: 'loan',
        description: `Customer made repayment of ₦${amount.toLocaleString()} for loan ${loan.applicationRef}`,
        severity: 'info',
        metadata: JSON.stringify({
          loanId: id,
          userId,
          amount,
          paymentMethod,
          receiptNumber,
          transactionId: transaction.id,
        }),
      },
    });

    // ── Fire payment_received notification (email + SMS) — fire-and-forget ──
    const customerName =
      `${loan.user?.firstName || ''} ${loan.user?.lastName || ''}`.trim();
    const fmtNaira = (n: number) =>
      '₦' + (n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });
    sendTemplatedNotification(
      'payment_received',
      {
        customerName,
        applicationRef: loan.applicationRef || '—',
        amount: fmtNaira(Number(amount)),
        reference: paymentRef,
        outstandingBalance: fmtNaira(outstandingBalance),
      },
      {
        email: loan.user?.email || undefined,
        phone: loan.user?.phone || undefined,
      },
    ).catch((e) =>
      console.error('[payment] notification failed:', e?.message),
    );

    // In-app notification for the customer
    db.notification
      .create({
        data: {
          userId,
          type: 'payment_received',
          title: `Payment of ${fmtNaira(Number(amount))} received`,
          message: `We've received your payment of ${fmtNaira(
            Number(amount),
          )} for loan ${loan.applicationRef}. Receipt #${receiptNumber}.`,
          category: 'payment',
          actionLabel: 'Download Receipt',
          actionView: 'customer-pay-back',
          actionParams: JSON.stringify({ loanId: id, paymentId: transaction.id }),
          metadata: JSON.stringify({ transactionId: transaction.id, receiptNumber }),
        },
      })
      .catch((e) =>
        console.error('[payment] in-app notify failed:', e?.message),
      );

    // Check if loan is fully paid
    const loanTotal =
      (loan.finalAmount || loan.approvedAmount || loan.amount) *
      (1 +
        ((loan.finalInterestRate || loan.percent || 24) / 100) *
          (loan.duration / 12));

    // ── Gamification: award points + update streak + check badges ──
    // The "due date" used to score the payment is the next unpaid installment
    // due date that existed at the time of payment. We captured `nextDueDate`
    // above (before recording the payment) so we use that. If unknown, fall
    // back to the loan maturity date, else "today" (always on-time).
    try {
      const scoringDueDate = nextDueDate
        ? new Date(nextDueDate)
        : loan.maturityDate
          ? new Date(loan.maturityDate)
          : new Date();
      await checkPaymentBadges(loan.userId, loan.id, new Date(), scoringDueDate);
    } catch (e: any) {
      console.warn('[gamification] checkPaymentBadges failed (non-fatal):', e?.message);
    }

    let loanClosed = false;
    if (newTotalPaid >= loanTotal) {
      await db.loanApplicants.update({
        where: { id },
        data: { status: 'paid' },
      });
      loanClosed = true;

      // Gamification: award loan-completion bonus + lifecycle badges
      try {
        await checkLoanCompletionBadges(loan.userId);
      } catch (e: any) {
        console.warn('[gamification] checkLoanCompletionBadges failed (non-fatal):', e?.message);
      }

      // Trigger the loan_completed drip campaign (fire-and-forget)
      if (loan.user?.email) {
        const { triggerDripCampaign } = await import('@/lib/email-campaigns');
        triggerDripCampaign('loan_completed', {
          email: loan.user.email,
          firstName: loan.user.firstName || 'Customer',
          lastName: loan.user.lastName || '',
        }).catch((e) =>
          console.error('[payment] drip loan_completed failed:', e?.message),
        );
      }
    }

    return NextResponse.json({
      success: true,
      transaction,
      message: `Payment of ₦${amount.toLocaleString()} recorded successfully`,
      totalPaidSoFar: newTotalPaid,
      outstandingBalance,
      loanClosed,
      receipt: {
        receiptNumber,
        transactionId: transaction.id,
        paymentMethod: paymentMethod || 'bank_transfer',
        reference: paymentRef,
        amount: Number(amount),
        paymentDate: transaction.transactionDate,
        outstandingBalance,
        nextDueDate,
        nextDueAmount,
        downloadUrl: `/api/customer/loan/${id}/receipt?userId=${userId}&paymentId=${transaction.id}&download=1`,
        viewUrl: `/api/customer/loan/${id}/receipt?userId=${userId}&paymentId=${transaction.id}`,
      },
    });
  } catch (e: any) {
    console.error('Payment error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
