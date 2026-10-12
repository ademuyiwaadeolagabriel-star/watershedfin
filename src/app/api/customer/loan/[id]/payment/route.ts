import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTemplatedNotification } from '@/lib/notification-templates';
import { checkPaymentBadges, checkLoanCompletionBadges } from '@/lib/gamification';
import { requireCustomerAuth } from '@/lib/auth';

import { safeError } from '@/lib/security/errors';
// POST /api/customer/loan/[id]/payment
// Authorization: Bearer <customer-jwt>
// Body: { amount, paymentMethod?, reference? }
//
// v50 changes (Issues #6, #10, #17):
//  - Customer identity is derived from the JWT, NOT from `body.userId`.
//    This eliminates IDOR risk where one customer could post a payment
//    referencing another customer's loan.
//  - All multi-write state mutations (LoanTransaction, Transactions,
//    AuditLog, LoanApplicants update) are wrapped in db.$transaction(...)
//    so the repayment either fully commits or fully rolls back. Previously
//    a failure mid-flow could leave a LoanTransaction row without a
//    matching Transactions row, breaking financial reconciliation.
//  - Idempotency: the paymentRef is enforced unique via upsert semantics.
//    If the client retries (double-click, network replay) with the same
//    reference, the existing record is returned instead of creating a
//    duplicate repayment.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id; // v50 — derived from JWT

    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { amount, paymentMethod, reference } = body || {};

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json(
        { error: 'Valid amount required' },
        { status: 400 },
      );
    }

    // --- Idempotency key -------------------------------------------------
    // If the client supplied a reference, check whether we already processed
    // it. If we did, return the prior result instead of creating a duplicate.
    const paymentRef =
      reference || `PMT-${id}-${Date.now().toString().slice(-10)}-${Math.random().toString(36).slice(2, 8)}`;

    if (reference) {
      const existing = await db.loanTransaction.findFirst({
        where: { reference: paymentRef },
      });
      if (existing) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          transaction: existing,
          message: 'Payment already processed (idempotent replay).',
        });
      }
    }

    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!loan) return NextResponse.json({ error: 'Loan not found' }, { status: 404 });

    // v50 — IDOR fix: the loan's owner MUST be the authenticated customer.
    if (loan.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: loan does not belong to authenticated customer.' },
        { status: 403 },
      );
    }
    if (loan.status !== 'running') {
      return NextResponse.json(
        { error: 'Loan is not active. Payments can only be made on running loans.' },
        { status: 400 },
      );
    }

    // Pre-compute outstanding balance AFTER this payment so we can stamp it on
    // the receipt metadata and include it in the customer notification.
    const priorRepayments = await db.loanTransaction.findMany({
      where: { loanApplicantId: id, type: 'repayment' },
    });
    const priorPaid = priorRepayments.reduce((s, t) => s + Number(t.amount), 0);

    // v51 — Decimal arithmetic: wrap each Decimal field with Number()
    // so the resulting values are plain numbers (not number | Decimal).
    const principal =
      Number(loan.finalAmount) ||
      Number(loan.vettedAmount) ||
      Number(loan.approvedAmount) ||
      Number(loan.amount);
    const tenorMonths =
      Number(loan.finalTenure) ||
      Number(loan.vettedDuration) ||
      Number(loan.approvedTenor) ||
      Number(loan.duration);
    const annualRate = Number(loan.finalInterestRate) || Number(loan.percent); // v53-P3: removed || 24 fallback
      if (annualRate == null || isNaN(Number(annualRate))) {
        return NextResponse.json({ error: "Loan is missing finalInterestRate. MD approval must record the rate before this operation can proceed." }, { status: 400 });
      }
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

    const receiptNumber = `RCP-${(loan.applicationRef || id).slice(-6).toUpperCase()}-${Date.now().toString().slice(-6).toUpperCase()}`;

    // v54 — Blocker 2: remove the hidden || 24 fallback (audit #7).
    // The loan-total calculation MUST use the MD-approved rate; if missing,
    // that's a data-integrity bug, not a fallback case.
    const finalRate = Number(loan.finalInterestRate) || Number(loan.percent);
    if (finalRate == null || isNaN(Number(finalRate))) {
      return NextResponse.json(
        { error: 'Loan is missing finalInterestRate. MD approval must record the rate before payments can be processed.' },
        { status: 400 },
      );
    }
    const loanPrincipal = Number(loan.finalAmount) || Number(loan.approvedAmount) || Number(loan.amount);
    const loanTotal =
      loanPrincipal *
      (1 + (Number(finalRate) / 100) * (Number(loan.duration) / 12));
    const willCloseLoan = newTotalPaid + Number(amount) >= loanTotal;

    // v54 — Blocker 2: outstanding-balance check (audit #6).
    // Customer cannot pay more than the outstanding balance. Overpayment
    // is rejected with 400 — no defined refund/excess process yet.
    const outstandingBeforePayment = Math.max(0, loanTotal - priorPaid);
    if (Number(amount) > outstandingBeforePayment) {
      return NextResponse.json(
        {
          error: `Payment amount ₦${Number(amount).toLocaleString()} exceeds outstanding balance ₦${outstandingBeforePayment.toLocaleString()}. Overpayment is not currently supported.`,
          outstandingBalance: outstandingBeforePayment,
          requestedAmount: Number(amount),
        },
        { status: 400 },
      );
    }

    // --- ATOMIC MULTI-WRITE ---------------------------------------------
    // v50 — All financial state transitions are wrapped in a single
    // Prisma transaction. If any one write fails, the entire repayment is
    // rolled back.
    // v54 — Blocker 2: ADDED LoanRepayment allocation loop. The route now
    // allocates the payment to the schedule rows (amountPaid + status
    // update) inside the SAME transaction as the LoanTransaction.create.
    // Previously the LoanRepayment rows stayed at amountPaid=0 even though
    // the customer paid — the overdue engine would then say the loan is
    // overdue. This closes audit #4.
    const transaction = await db.$transaction(async (tx) => {
      const txRow = await tx.loanTransaction.create({
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

      await tx.transactions.create({
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

      await tx.auditLog.create({
        data: {
          action: 'created',
          module: 'loan',
          description: `Customer made repayment of ₦${Number(amount).toLocaleString()} for loan ${loan.applicationRef}`,
          severity: 'info',
          metadata: JSON.stringify({
            loanId: id,
            userId,
            amount,
            paymentMethod,
            receiptNumber,
            transactionId: txRow.id,
          }),
        },
      });

      // v54 — Blocker 2: allocate payment to LoanRepayment rows.
      // Fetch the pending/partial/overdue schedule rows in due-date order,
      // allocate the payment amount across them, and update amountPaid +
      // status atomically. This is the authoritative ledger write — the
      // overdue engine reads LoanRepayment, so this must be in the same
      // transaction as the LoanTransaction.create.
      const scheduleRows = await tx.loanRepayment.findMany({
        where: {
          loanApplicantId: id,
          status: { in: ['pending', 'partial', 'overdue'] },
        },
        orderBy: { dueDate: 'asc' },
      });

      let remaining = Number(amount);
      for (const row of scheduleRows) {
        if (remaining <= 0) break;
        const due = Number(row.amountDue);
        const alreadyPaid = Number(row.amountPaid);
        const outstanding = Math.max(0, due - alreadyPaid);
        if (outstanding <= 0) continue;
        const payNow = Math.min(outstanding, remaining);
        const newPaid = alreadyPaid + payNow;
        const newStatus = newPaid >= due ? 'paid' : 'partial';
        await tx.loanRepayment.update({
          where: { id: row.id },
          data: {
            amountPaid: newPaid,
            status: newStatus,
            paidAt: newStatus === 'paid' ? new Date() : row.paidAt,
            paymentMethod: paymentMethod || 'bank_transfer',
          },
        });
        remaining -= payNow;
      }

      if (willCloseLoan) {
        await tx.loanApplicants.update({
          where: { id },
          data: { status: 'paid' },
        });
      }

      return txRow;
    });

    // --- Post-transaction side effects (NOT inside the DB transaction) ----
    // These are fire-and-forget: notifications, gamification, drip emails.
    // They must never cause the repayment itself to fail.
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

    // Gamification (fire-and-forget)
    try {
      const scoringDueDate = nextDueDate
        ? new Date(nextDueDate)
        : loan.maturityDate
          ? new Date(loan.maturityDate)
          : new Date();
      await checkPaymentBadges(loan.userId, loan.id, new Date(), scoringDueDate);
      if (willCloseLoan) {
        await checkLoanCompletionBadges(loan.userId);
      }
    } catch (e: any) {
      console.warn('[gamification] checkPaymentBadges failed (non-fatal):', e?.message);
    }

    if (willCloseLoan && loan.user?.email) {
      const { triggerDripCampaign } = await import('@/lib/email-campaigns');
      triggerDripCampaign('loan_completed', {
        email: loan.user.email,
        firstName: loan.user.firstName || 'Customer',
        lastName: loan.user.lastName || '',
      }).catch((e) =>
        console.error('[payment] drip loan_completed failed:', e?.message),
      );
    }

    return NextResponse.json({
      success: true,
      transaction,
      message: `Payment of ₦${Number(amount).toLocaleString()} recorded successfully`,
      totalPaidSoFar: newTotalPaid,
      outstandingBalance,
      loanClosed: willCloseLoan,
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
        downloadUrl: `/api/customer/loan/${id}/receipt?paymentId=${transaction.id}&download=1`,
        viewUrl: `/api/customer/loan/${id}/receipt?paymentId=${transaction.id}`,
      },
    });
  } catch (e: any) {
    console.error('Payment error:', e);
    // Prisma P2002 = unique constraint violation — this is the idempotency
    // path. If the caller raced themselves on the same reference, return the
    // already-processed response.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { success: true, idempotent: true, error: 'Duplicate payment reference — already processed.' },
        { status: 200 },
      );
    }
    return safeError('An unexpected error occurred.', 500);;
  }
}
