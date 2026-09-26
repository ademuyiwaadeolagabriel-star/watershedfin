import { Prisma } from '@prisma/client';

type TransactionClient = Prisma.TransactionClient;

export class LoanRepaymentError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly details?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = 'LoanRepaymentError';
  }
}

export type RepaymentServiceInput = {
  tx: TransactionClient;
  loanId: string;
  paymentAmount: Prisma.Decimal;
  paymentRef: string;
  paymentMethod?: string;
  userId: string;
};

export type RepaymentServiceResult = {
  transaction: Awaited<
    ReturnType<TransactionClient['loanTransaction']['create']>
  >;
  receiptNumber: string;
  outstandingBalance: Prisma.Decimal;
  nextDueDate: Date | null;
  nextDueAmount: Prisma.Decimal | null;
  totalPaid: Prisma.Decimal;
  loanClosed: boolean;
  applicationRef: string;
};

/**
 * Authoritative repayment operation.
 *
 * Financial source of truth:
 *   LoanRepayment
 *
 * The caller is responsible for authentication and authorization.
 *
 * This function must run inside the caller's Prisma transaction.
 */
export async function applyLoanRepayment({
  tx,
  loanId,
  paymentAmount,
  paymentRef,
  paymentMethod,
  userId,
}: RepaymentServiceInput): Promise<RepaymentServiceResult> {
  if (paymentAmount.lte(0)) {
    throw new LoanRepaymentError(
      'INVALID_AMOUNT',
      'Payment amount must be greater than zero.',
    );
  }

  // =====================================================================
  // 1. LOCK LOAN
  // =====================================================================

  await tx.$queryRaw`
    SELECT "id"
    FROM "LoanApplicants"
    WHERE "id" = ${loanId}
    FOR UPDATE
  `;

  const loan = await tx.loanApplicants.findUnique({
    where: {
      id: loanId,
    },
    select: {
      id: true,
      status: true,
      applicationRef: true,
    },
  });

  if (!loan) {
    throw new LoanRepaymentError(
      'LOAN_NOT_FOUND',
      'Loan not found.',
    );
  }

  if (loan.status !== 'running') {
    throw new LoanRepaymentError(
      'LOAN_NOT_ACTIVE',
      'Loan is not active. Payments can only be made on running loans.',
    );
  }

  // =====================================================================
  // 2. LOCK AUTHORITATIVE REPAYMENT SCHEDULE
  // =====================================================================

  await tx.$queryRaw`
    SELECT "id"
    FROM "LoanRepayment"
    WHERE
      "loanApplicantId" = ${loanId}
      AND "status" IN ('pending', 'partial', 'overdue')
    FOR UPDATE
  `;

  const scheduleRows = await tx.loanRepayment.findMany({
    where: {
      loanApplicantId: loanId,
      status: {
        in: ['pending', 'partial', 'overdue'],
      },
    },
    orderBy: [
      {
        dueDate: 'asc',
      },
      {
        id: 'asc',
      },
    ],
  });

  if (scheduleRows.length === 0) {
    throw new LoanRepaymentError(
      'NO_REPAYMENT_SCHEDULE',
      'No active repayment schedule exists for this loan. Payment cannot be processed until the repayment schedule is available.',
    );
  }

  // =====================================================================
  // 3. AUTHORITATIVE OUTSTANDING BALANCE
  // =====================================================================

  let outstandingBalance =
    new Prisma.Decimal(0);

  for (const row of scheduleRows) {
    const amountDue =
      new Prisma.Decimal(row.amountDue);

    const amountPaid =
      new Prisma.Decimal(row.amountPaid);

    const rowOutstanding =
      amountDue.minus(amountPaid);

    if (rowOutstanding.gt(0)) {
      outstandingBalance =
        outstandingBalance.plus(
          rowOutstanding,
        );
    }
  }

  if (paymentAmount.gt(outstandingBalance)) {
    throw new LoanRepaymentError(
      'OVERPAYMENT',
      `Payment amount exceeds the outstanding balance of ${outstandingBalance.toString()}. Overpayment is not currently supported.`,
      {
        outstandingBalance:
          outstandingBalance.toString(),
        requestedAmount:
          paymentAmount.toString(),
      },
    );
  }

  // =====================================================================
  // 4. OLDEST-DUE-FIRST ALLOCATION
  // =====================================================================

  let remaining = paymentAmount;

  for (const row of scheduleRows) {
    if (remaining.lte(0)) {
      break;
    }

    const amountDue =
      new Prisma.Decimal(row.amountDue);

    const amountPaid =
      new Prisma.Decimal(row.amountPaid);

    const rowOutstanding =
      amountDue.minus(amountPaid);

    if (rowOutstanding.lte(0)) {
      continue;
    }

    const payNow =
      Prisma.Decimal.min(
        rowOutstanding,
        remaining,
      );

    const newPaid =
      amountPaid.plus(payNow);

    const fullyPaid =
      newPaid.gte(amountDue);

    await tx.loanRepayment.update({
      where: {
        id: row.id,
      },
      data: {
        amountPaid: newPaid,
        status: fullyPaid
          ? 'paid'
          : 'partial',
        paidAt: fullyPaid
          ? new Date()
          : row.paidAt,
        paymentMethod:
          paymentMethod ||
          'bank_transfer',
      },
    });

    remaining =
      remaining.minus(payNow);
  }

  if (remaining.gt(0)) {
    throw new LoanRepaymentError(
      'INCOMPLETE_ALLOCATION',
      'Payment could not be completely allocated to the repayment schedule. No financial changes were committed.',
      {
        unallocatedAmount:
          remaining.toString(),
      },
    );
  }

  // =====================================================================
  // 5. RELOAD AUTHORITATIVE SCHEDULE
  // =====================================================================

  const updatedScheduleRows =
    await tx.loanRepayment.findMany({
      where: {
        loanApplicantId: loanId,
      },
      orderBy: [
        {
          dueDate: 'asc',
        },
        {
          id: 'asc',
        },
      ],
    });

  let outstandingAfterPayment =
    new Prisma.Decimal(0);

  let nextDueDate: Date | null = null;
  let nextDueAmount:
    Prisma.Decimal | null = null;

  let allPaid = true;

  for (const row of updatedScheduleRows) {
    const amountDue =
      new Prisma.Decimal(row.amountDue);

    const amountPaid =
      new Prisma.Decimal(row.amountPaid);

    const rowOutstanding =
      amountDue.minus(amountPaid);

    if (rowOutstanding.gt(0)) {
      allPaid = false;

      outstandingAfterPayment =
        outstandingAfterPayment.plus(
          rowOutstanding,
        );

      if (!nextDueDate) {
        nextDueDate = row.dueDate;
        nextDueAmount =
          rowOutstanding;
      }
    }
  }

  // =====================================================================
  // 6. RECEIPT
  // =====================================================================

  const receiptNumber =
    `RCP-${(loan.applicationRef || loanId)
      .slice(-6)
      .toUpperCase()}-${Date.now()
      .toString()
      .slice(-6)
      .toUpperCase()}`;

  // =====================================================================
  // 7. LOAN TRANSACTION
  // =====================================================================

  const txRow =
    await tx.loanTransaction.create({
      data: {
        loanApplicantId: loanId,
        type: 'repayment',
        amount: paymentAmount,
        reference: paymentRef,
        transactionDate: new Date(),
        metadata: JSON.stringify({
          paymentMethod:
            paymentMethod ||
            'bank_transfer',
          userId,
          receiptNumber,
          outstandingBalance:
            outstandingAfterPayment.toString(),
          nextDueDate: nextDueDate
            ? nextDueDate.toISOString()
            : null,
          nextDueAmount:
            nextDueAmount
              ? nextDueAmount.toString()
              : null,
        }),
      },
    });

  // =====================================================================
  // 8. GENERAL TRANSACTION LEDGER
  // =====================================================================

  await tx.transactions.create({
    data: {
      userId,
      type: 'loan_repaid',
      amount: paymentAmount,
      charge: new Prisma.Decimal(0),
      status: 'success',
      reference: paymentRef,
      trxRef: loan.applicationRef,
    },
  });

  // =====================================================================
  // 9. AUDIT
  // =====================================================================

  await tx.auditLog.create({
    data: {
      action: 'created',
      module: 'loan',
      description:
        `Loan repayment of ${paymentAmount.toString()} for loan ${
          loan.applicationRef || loanId
        }`,
      severity: 'info',
      metadata: JSON.stringify({
        loanId,
        userId,
        amount:
          paymentAmount.toString(),
        paymentMethod,
        receiptNumber,
        transactionId: txRow.id,
      }),
    },
  });

  // =====================================================================
  // 10. CLOSE ONLY FROM AUTHORITATIVE SCHEDULE
  // =====================================================================

  if (allPaid) {
    await tx.loanApplicants.update({
      where: {
        id: loanId,
      },
      data: {
        status: 'paid',
      },
    });
  }

  // =====================================================================
  // 11. TRANSACTION HISTORY TOTAL
  // =====================================================================

  const repaymentTotals =
    await tx.loanTransaction.aggregate({
      where: {
        loanApplicantId: loanId,
        type: 'repayment',
      },
      _sum: {
        amount: true,
      },
    });

  const totalPaid =
    repaymentTotals._sum.amount ||
    new Prisma.Decimal(0);

  return {
    transaction: txRow,
    receiptNumber,
    outstandingBalance:
      outstandingAfterPayment,
    nextDueDate,
    nextDueAmount,
    totalPaid,
    loanClosed: allPaid,
    applicationRef:
      loan.applicationRef || loanId,
  };
}
