import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { db } from '@/lib/db';
import { sendTemplatedNotification } from '@/lib/notification-templates';
import {
  checkPaymentBadges,
  checkLoanCompletionBadges,
} from '@/lib/gamification';
import { requireCustomerAuth } from '@/lib/auth';
import {
  applyLoanRepayment,
  LoanRepaymentError,
} from '@/lib/loan-repayment';

// POST /api/customer/loan/[id]/payment
//
// Authorization:
//   Bearer <customer-jwt>
//
// Body:
//   {
//     amount: number|string,
//     paymentMethod?: string,
//     reference?: string
//   }
//
// Financial integrity rules:
// - Customer identity comes only from JWT.
// - Customer may only pay their own loan.
// - LoanRepayment is the authoritative repayment ledger.
// - PostgreSQL locks the loan and repayment rows during allocation.
// - Payment cannot exceed the schedule's actual outstanding balance.
// - Payment must be fully allocated before the transaction commits.
// - LoanTransaction + Transactions + LoanRepayment + AuditLog +
//   LoanApplicants status update are atomic.
// - The same payment reference is idempotent.
// - Internal exception messages are never returned to the customer.
// - Notifications/gamification are post-transaction side effects.

/**
 * Controlled business error.
 *
 * These errors are safe to expose to the customer.
 * Unexpected errors are deliberately hidden behind a generic message.
 */
class PaymentRouteError extends Error {
  constructor(
    public readonly code: string,
    public readonly publicMessage: string,
    public readonly status: number,
    public readonly details?: Record<string, unknown>,
  ) {
    super(publicMessage);
    this.name = 'PaymentRouteError';
  }
}

/**
 * Validate a customer-supplied monetary amount.
 *
 * The database uses Decimal(18,2), so this route accepts at most
 * two decimal places.
 */
function isValidMoneyInput(value: unknown): boolean {
  if (typeof value === 'number') {
    return Number.isFinite(value) && value > 0;
  }

  if (typeof value !== 'string') {
    return false;
  }

  const normalized = value.trim();

  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) {
    return false;
  }

  return Number(normalized) > 0;
}

/**
 * Convert a validated value to Prisma Decimal.
 */
function toMoney(value: unknown): Prisma.Decimal {
  return new Prisma.Decimal(String(value));
}

/**
 * Format a monetary amount for customer-facing Nigerian Naira messages.
 */
function formatNaira(
  value: Prisma.Decimal | number | string,
): string {
  const amount =
    value instanceof Prisma.Decimal
      ? value.toNumber()
      : Number(value);

  return `Ã¢â€šÂ¦${(Number.isFinite(amount) ? amount : 0).toLocaleString(
    'en-NG',
    {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2,
    },
  )}`;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  /**
   * paymentRef must exist in the outer scope because the final catch
   * block needs it for the P2002 idempotency path.
   */
  let paymentRef = '';

  try {
    // =====================================================================
    // 1. AUTHENTICATION
    // =====================================================================

    const authResult = await requireCustomerAuth(req);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const authPayload = authResult as {
      id: string;
      type: string;
    };

    // IMPORTANT:
    // Customer identity comes from the authenticated JWT.
    // It is never accepted from the request body.
    const userId = authPayload.id;

    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        {
          error: 'Loan ID is required.',
        },
        {
          status: 400,
        },
      );
    }

    // =====================================================================
    // 2. REQUEST VALIDATION
    // =====================================================================

    const body = await req.json().catch(() => ({}));

    const {
      amount,
      paymentMethod,
      reference,
    } = body || {};

    if (!isValidMoneyInput(amount)) {
      return NextResponse.json(
        {
          error: 'Valid payment amount is required.',
        },
        {
          status: 400,
        },
      );
    }

    const paymentAmount = toMoney(amount);

    if (paymentAmount.lte(0)) {
      return NextResponse.json(
        {
          error: 'Payment amount must be greater than zero.',
        },
        {
          status: 400,
        },
      );
    }

    // =====================================================================
    // 3. PAYMENT REFERENCE / IDEMPOTENCY KEY
    // =====================================================================

    paymentRef =
      typeof reference === 'string' && reference.trim()
        ? reference.trim()
        : `PMT-${id}-${Date.now()}-${Math.random()
            .toString(36)
            .slice(2, 8)}`;

    // Reject excessively large references.
    if (paymentRef.length > 191) {
      return NextResponse.json(
        {
          error: 'Payment reference is too long.',
        },
        {
          status: 400,
        },
      );
    }

    // Fast idempotency check.
    //
    // The database unique constraint remains the final authority in the
    // event of two simultaneous requests using the same reference.
    if (reference) {
      const existing =
        await db.loanTransaction.findUnique({
          where: {
            reference: paymentRef,
          },
        });

      if (existing) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          transaction: existing,
          message: 'Payment already processed.',
        });
      }
    }

    // =====================================================================
    // 4. ATOMIC FINANCIAL TRANSACTION
    // =====================================================================
    //
    // SERIALIZABLE protects against concurrent financial operations.
    //
    // We also explicitly lock the loan row and repayment rows using
    // PostgreSQL FOR UPDATE.
    //
    // This prevents two simultaneous payments from both reading the same
    // outstanding balance and both being accepted.
    // =====================================================================

    let financialResult: {
      transaction: Awaited<
        ReturnType<typeof db.loanTransaction.create>
      >;
      receiptNumber: string;
      outstandingBalance: Prisma.Decimal;
      nextDueDate: Date | null;
      nextDueAmount: Prisma.Decimal | null;
      totalPaid: Prisma.Decimal;
      loanClosed: boolean;
      customerName: string;
      customerEmail?: string;
      customerPhone?: string;
      applicationRef: string;
      userId: string;
    };

    try {
      financialResult = await db.$transaction(
        async (tx) => {
          const loan =
            await tx.loanApplicants.findUnique({
              where: {
                id,
              },
              include: {
                user: true,
              },
            });

          if (!loan) {
            throw new PaymentRouteError(
              'LOAN_NOT_FOUND',
              'Loan not found.',
              404,
            );
          }

          if (loan.userId !== userId) {
            throw new PaymentRouteError(
              'FORBIDDEN',
              'Forbidden.',
              403,
            );
          }

          const repaymentResult =
            await applyLoanRepayment({
              tx,
              loanId: id,
              paymentAmount,
              paymentRef,
              paymentMethod:
                paymentMethod || 'bank_transfer',
              userId,
            });

          const customerName =
            `${loan.user?.firstName || ''} ${
              loan.user?.lastName || ''
            }`.trim();

          return {
            ...repaymentResult,
            customerName,
            customerEmail:
              loan.user?.email || undefined,
            customerPhone:
              loan.user?.phone || undefined,
            userId,
          };
        },
        {
          isolationLevel:
            Prisma.TransactionIsolationLevel.Serializable,
          maxWait: 10_000,
          timeout: 30_000,
        },
      );
    } catch (error: unknown) {
      if (
        error &&
        typeof error === 'object' &&
        'code' in error &&
        (error as { code?: string }).code === 'P2034'
      ) {
        return NextResponse.json(
          {
            error:
              'This payment could not be safely processed because another financial operation occurred at the same time. Please retry the payment.',
          },
          {
            status: 409,
          },
        );
      }

      throw error;
    }
    // 5. PAYMENT RECEIVED NOTIFICATION
    // =====================================================================
    //
    // These operations happen AFTER the financial transaction commits.
    //
    // If email/SMS fails, the payment remains committed.
    // =====================================================================

    sendTemplatedNotification(
      'payment_received',
      {
        customerName:
          financialResult.customerName,

        applicationRef:
          financialResult.applicationRef,

        amount:
          formatNaira(paymentAmount),

        reference:
          paymentRef,

        outstandingBalance:
          formatNaira(
            financialResult.outstandingBalance,
          ),
      },
      {
        email:
          financialResult.customerEmail,

        phone:
          financialResult.customerPhone,
      },
    ).catch((error: unknown) => {
      console.error(
        '[payment] notification failed:',
        error instanceof Error
          ? error.message
          : 'unknown error',
      );
    });

    // =====================================================================
    // 6. IN-APP NOTIFICATION
    // =====================================================================

    db.notification
      .create({
        data: {
          userId,

          type: 'payment_received',

          title:
            `Payment of ${formatNaira(
              paymentAmount,
            )} received`,

          message:
            `We've received your payment of ${formatNaira(
              paymentAmount,
            )} for loan ${
              financialResult.applicationRef
            }. Receipt #${
              financialResult.receiptNumber
            }.`,

          category: 'payment',

          actionLabel:
            'Download Receipt',

          actionView:
            'customer-pay-back',

          actionParams:
            JSON.stringify({
              loanId: id,
              paymentId:
                financialResult.transaction.id,
            }),

          metadata:
            JSON.stringify({
              transactionId:
                financialResult.transaction.id,
              receiptNumber:
                financialResult.receiptNumber,
            }),
        },
      })
      .catch((error: unknown) => {
        console.error(
          '[payment] in-app notification failed:',
          error instanceof Error
            ? error.message
            : 'unknown error',
        );
      });

    // =====================================================================
    // 7. GAMIFICATION
    // =====================================================================

    try {
      const scoringDueDate =
        financialResult.nextDueDate ||
        new Date();

      await checkPaymentBadges(
        userId,
        id,
        new Date(),
        scoringDueDate,
      );

      if (financialResult.loanClosed) {
        await checkLoanCompletionBadges(
          userId,
        );
      }
    } catch (error: unknown) {
      console.warn(
        '[gamification] payment badge processing failed:',
        error instanceof Error
          ? error.message
          : 'unknown error',
      );
    }

    // =====================================================================
    // 8. LOAN COMPLETION DRIP CAMPAIGN
    // =====================================================================

    if (
      financialResult.loanClosed &&
      financialResult.customerEmail
    ) {
      const {
        triggerDripCampaign,
      } = await import(
        '@/lib/email-campaigns'
      );

      triggerDripCampaign(
        'loan_completed',
        {
          email:
            financialResult.customerEmail,

          firstName:
            financialResult.customerName
              .split(' ')[0] ||
            'Customer',

          lastName:
            financialResult.customerName
              .split(' ')
              .slice(1)
              .join(' '),
        },
      ).catch((error: unknown) => {
        console.error(
          '[payment] loan completion drip failed:',
          error instanceof Error
            ? error.message
            : 'unknown error',
        );
      });
    }

    // =====================================================================
    // 9. SUCCESS RESPONSE
    // =====================================================================

    return NextResponse.json({
      success: true,

      transaction:
        financialResult.transaction,

      message:
        `Payment of ${formatNaira(
          paymentAmount,
        )} recorded successfully.`,

      totalPaidSoFar:
        financialResult.totalPaid.toString(),

      outstandingBalance:
        financialResult.outstandingBalance.toString(),

      loanClosed:
        financialResult.loanClosed,

      receipt: {
        receiptNumber:
          financialResult.receiptNumber,

        transactionId:
          financialResult.transaction.id,

        paymentMethod:
          paymentMethod ||
          'bank_transfer',

        reference:
          paymentRef,

        amount:
          paymentAmount.toString(),

        paymentDate:
          financialResult.transaction
            .transactionDate,

        outstandingBalance:
          financialResult
            .outstandingBalance
            .toString(),

        nextDueDate:
          financialResult.nextDueDate,

        nextDueAmount:
          financialResult.nextDueAmount
            ? financialResult
                .nextDueAmount
                .toString()
            : null,

        downloadUrl:
          `/api/customer/loan/${id}/receipt?paymentId=${financialResult.transaction.id}&download=1`,

        viewUrl:
          `/api/customer/loan/${id}/receipt?paymentId=${financialResult.transaction.id}`,
      },
    });
  } catch (error: unknown) {
    // =====================================================================
    // SHARED REPAYMENT SERVICE ERRORS

    if (error instanceof LoanRepaymentError) {
      const statusByCode: Record<string, number> = {
        INVALID_AMOUNT: 400,
        LOAN_NOT_FOUND: 404,
        LOAN_NOT_ACTIVE: 400,
        NO_REPAYMENT_SCHEDULE: 409,
        OVERPAYMENT: 400,
        INCOMPLETE_ALLOCATION: 409,
      };

      return NextResponse.json(
        {
          error: error.publicMessage,
          ...(error.details || {}),
        },
        {
          status: statusByCode[error.code] || 409,
        },
      );
    }
    // 10. EXPECTED BUSINESS ERRORS
    // =====================================================================

    if (
      error instanceof PaymentRouteError
    ) {
      return NextResponse.json(
        {
          error:
            error.publicMessage,

          ...(error.details || {}),
        },
        {
          status:
            error.status,
        },
      );
    }

    // =====================================================================
    // 11. IDEMPOTENCY / UNIQUE CONSTRAINT
    // =====================================================================

    if (
      error &&
      typeof error === 'object' &&
      'code' in error &&
      (error as { code?: string }).code ===
        'P2002'
    ) {
      const existing =
        await db.loanTransaction.findUnique({
          where: {
            reference: paymentRef,
          },
        }).catch(() => null);

      if (existing) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          transaction: existing,
          message:
            'Payment already processed.',
        });
      }

      return NextResponse.json(
        {
          error:
            'The payment reference has already been used.',
        },
        {
          status: 409,
        },
      );
    }

    // =====================================================================
    // 12. GENERIC INTERNAL ERROR
    // =====================================================================
    //
    // NEVER expose error.message to the customer.
    //
    // A correlation ID allows support/engineering to find the actual
    // server-side error in logs.
    // =====================================================================

    const correlationId =
      `PAY-${Date.now()}-${Math.random()
        .toString(36)
        .slice(2, 8)
        .toUpperCase()}`;

    console.error(
      `[payment:${correlationId}] Payment processing failed:`,
      error,
    );

    return NextResponse.json(
      {
        error:
          'Payment could not be processed. Please try again or contact support.',

        correlationId,
      },
      {
        status: 500,
      },
    );
  }
}