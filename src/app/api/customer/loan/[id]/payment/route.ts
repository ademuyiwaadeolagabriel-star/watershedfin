import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { sendTemplatedNotification } from '@/lib/notification-templates';
import { checkPaymentBadges, checkLoanCompletionBadges } from '@/lib/gamification';
import { requireCustomerAuth } from '@/lib/auth';
import { Prisma } from '@prisma/client';
import crypto from 'crypto';

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
      reference || `PMT-${id}-${crypto.randomUUID()}`;

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

    // All authoritative balance calculations happen inside the transaction.
    // This prevents concurrent payments from both observing the same stale
    // outstanding balance and overpaying the loan.
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
    const result = await db.$transaction(async (tx) => {
      const scheduleRows = await tx.loanRepayment.findMany({
        where: {
          loanApplicantId: id,
          status: { in: ['pending', 'partial', 'overdue'] },
        },
        orderBy: { dueDate: 'asc' },
      });
      if (scheduleRows.length === 0) {
        throw new Error('NO_REPAYMENT_SCHEDULE');
      }

      const totalOutstanding = scheduleRows.reduce(
        (sum, row) => sum + Math.max(0, Number(row.amountDue) - Number(row.amountPaid)),
        0,
      );
      const requestedAmount = Number(amount);
      if (requestedAmount > totalOutstanding + 0.005) {
        const err: any = new Error('OVERPAYMENT');
        err.outstandingBalance = totalOutstanding;
        err.requestedAmount = requestedAmount;
        throw err;
      }

      const paymentDate = new Date();
      const receiptNumber = `RCP-${(loan.applicationRef || id).slice(-6).toUpperCase()}-${crypto.randomUUID().slice(0, 6).toUpperCase()}`;

      const txRow = await tx.loanTransaction.create({
        data: {
          loanApplicantId: id,
          type: 'repayment',
          amount: requestedAmount,
          reference: paymentRef,
          transactionDate: paymentDate,
          metadata: JSON.stringify({
            paymentMethod: paymentMethod || 'bank_transfer',
            userId,
            receiptNumber,
          }),
        },
      });

      await tx.transactions.create({
        data: {
          userId,
          type: 'loan_repaid',
          amount: requestedAmount,
          charge: 0,
          status: 'success',
          reference: paymentRef,
          trxRef: loan.applicationRef,
        },
      });

      let remaining = requestedAmount;
      const projectedRows = scheduleRows.map((row) => ({ ...row, amountPaid: Number(row.amountPaid) }));
      for (const row of projectedRows) {
        if (remaining <= 0.005) break;
        const due = Number(row.amountDue);
        const alreadyPaid = Number(row.amountPaid);
        const outstanding = Math.max(0, due - alreadyPaid);
        if (outstanding <= 0) continue;
        const payNow = Math.min(outstanding, remaining);
        const newPaid = alreadyPaid + payNow;
        const newStatus = newPaid >= due - 0.005 ? 'paid' : 'partial';
        await tx.loanRepayment.update({
          where: { id: row.id },
          data: {
            amountPaid: newPaid,
            status: newStatus,
            paidAt: newStatus === 'paid' ? paymentDate : row.paidAt,
            paymentMethod: paymentMethod || 'bank_transfer',
          },
        });
        row.amountPaid = newPaid;
        row.status = newStatus;
        remaining -= payNow;
      }

      const totalPaidAfter = projectedRows.reduce((sum, row) => sum + Number(row.amountPaid), 0);
      const outstandingAfter = Math.max(0, totalOutstanding - requestedAmount);
      const allPaid = projectedRows.every(
        row => Number(row.amountPaid) >= Number(row.amountDue) - 0.005,
      );

      if (allPaid) {
        await tx.loanApplicants.update({
          where: { id },
          data: { status: 'paid' },
        });
      }

      await tx.auditLog.create({
        data: {
          action: 'created',
          module: 'loan',
          description: `Customer made repayment of ₦${requestedAmount.toLocaleString()} for loan ${loan.applicationRef}`,
          severity: 'info',
          metadata: JSON.stringify({
            loanId: id,
            userId,
            amount: requestedAmount,
            paymentMethod,
            receiptNumber,
            transactionId: txRow.id,
            outstandingBefore: totalOutstanding,
            outstandingAfter,
          }),
        },
      });

      const nextDue = projectedRows.find(row => Number(row.amountPaid) < Number(row.amountDue) - 0.005);
      return {
        txRow,
        receiptNumber,
        totalPaidAfter,
        outstandingAfter,
        nextDueDate: nextDue?.dueDate || null,
        nextDueAmount: nextDue ? Math.max(0, Number(nextDue.amountDue) - Number(nextDue.amountPaid)) : null,
        loanClosed: allPaid,
      };
    }, {
      isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
      maxWait: 5000,
      timeout: 15000,
    });

    const transaction = result.txRow;
    const outstandingBalance = result.outstandingAfter;
    const nextDueDate = result.nextDueDate;
    const nextDueAmount = result.nextDueAmount;
    const receiptNumber = result.receiptNumber;
    const willCloseLoan = result.loanClosed;
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
      totalPaidSoFar: result.totalPaidAfter,
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
    if (e?.message === 'OVERPAYMENT') {
      return NextResponse.json({
        error: `Payment exceeds outstanding balance.`,
        outstandingBalance: e.outstandingBalance,
        requestedAmount: e.requestedAmount,
      }, { status: 400 });
    }
    if (e?.message === 'NO_REPAYMENT_SCHEDULE') {
      return NextResponse.json({ error: 'Loan repayment schedule is missing; payment cannot be posted.' }, { status: 409 });
    }
    // Prisma P2002 = unique constraint violation — this is the idempotency
    // path. If the caller raced themselves on the same reference, return the
    // already-processed response.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { success: true, idempotent: true, error: 'Duplicate payment reference — already processed.' },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
