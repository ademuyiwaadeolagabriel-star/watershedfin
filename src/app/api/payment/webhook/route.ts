import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// POST /api/payment/webhook
// Mock webhook handler — same as verify but for gateway callbacks.
// In production this endpoint would be called by the payment gateway (Paystack,
// Flutterwave, Moniepoint etc.) after the customer completes checkout.
// We accept { paymentRef, event, status } or a raw gateway payload.
//
// v41: Now handles BOTH loan repayments (Transactions table) AND onboarding
// payments (OnboardingPayment table). Previously onboarding Paystack payments
// were never confirmed, leaving customers stuck in payment_pending forever.
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    // Support either { paymentRef } or gateway-style { data: { reference } }
    const paymentRef =
      body.paymentRef ||
      body.reference ||
      (body.data && (body.data.reference || body.data.paymentRef));

    if (!paymentRef) {
      return NextResponse.json(
        { error: 'paymentRef (or gateway reference) is required' },
        { status: 400 },
      );
    }

    // ── v41: FIRST try OnboardingPayment (CAC search fee) ──────────────────
    const onboardingPayment = await db.onboardingPayment.findFirst({
      where: { reference: paymentRef },
    });

    if (onboardingPayment) {
      return handleOnboardingPayment(onboardingPayment, body);
    }

    // ── THEN try Transactions (loan repayment / wallet funding) ────────────
    const txn = await db.transactions.findUnique({
      where: { reference: paymentRef },
    });

    if (!txn) {
      return NextResponse.json({ error: 'Payment reference not found' }, { status: 404 });
    }

    // Idempotency — if already successful, just acknowledge
    if (txn.status === 'success') {
      return NextResponse.json({
        status: 'success',
        amount: txn.amount,
        reference: txn.reference,
        message: 'Webhook already processed.',
      });
    }

    let meta: { loanId?: string; method?: string; type?: string } = {};
    try {
      meta = txn.metadata ? JSON.parse(txn.metadata) : {};
    } catch {
      meta = {};
    }
    const loanId = meta.loanId || txn.trxRef || null;

    // Mark transaction as success
    const updated = await db.transactions.update({
      where: { id: txn.id },
      data: { status: 'success' },
    });

    if (loanId) {
      const loan = await db.loanApplicants.findUnique({ where: { id: loanId } });
      if (loan) {
        await db.loanTransaction.create({
          data: {
            loanApplicantId: loanId,
            type: 'repayment',
            amount: txn.amount,
            reference: paymentRef,
            transactionDate: new Date(),
            metadata: JSON.stringify({
              source: 'webhook',
              method: meta.method || 'mock',
              paymentRef,
              userId: txn.userId,
            }),
          },
        });

        // Apply repayment to schedule
        const schedule = await db.loanRepayment.findMany({
          where: { loanApplicantId: loanId, status: { in: ['pending', 'partial', 'overdue'] } },
          orderBy: { dueDate: 'asc' },
        });

        let remaining = txn.amount;
        for (const row of schedule) {
          if (remaining <= 0) break;
          const outstanding = Math.max(0, row.amountDue - row.amountPaid);
          if (outstanding <= 0) continue;
          const payNow = Math.min(outstanding, remaining);
          const newPaid = row.amountPaid + payNow;
          const newStatus = newPaid >= row.amountDue ? 'paid' : 'partial';
          await db.loanRepayment.update({
            where: { id: row.id },
            data: {
              amountPaid: newPaid,
              status: newStatus,
              paidAt: newStatus === 'paid' ? new Date() : row.paidAt,
              paymentMethod: meta.method || 'mock',
            },
          });
          remaining -= payNow;
        }

        // Auto-close loan if fully paid
        const allRows = await db.loanRepayment.findMany({
          where: { loanApplicantId: loanId },
        });
        const allPaid = allRows.length > 0 && allRows.every((r) => r.status === 'paid');
        if (allPaid) {
          await db.loanApplicants.update({
            where: { id: loanId },
            data: { status: 'paid' },
          });
        }
      }
    } else {
      // Wallet funding
      const balance = await db.balance.findUnique({ where: { userId: txn.userId } });
      if (balance) {
        await db.balance.update({
          where: { userId: txn.userId },
          data: { amount: balance.amount + txn.amount },
        });
      } else {
        await db.balance.create({
          data: { userId: txn.userId, amount: txn.amount },
        });
      }
    }

    return NextResponse.json({
      status: 'success',
      amount: updated.amount,
      reference: updated.reference,
    });
  } catch (e: any) {
    console.error('Payment webhook error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// ── v41: Onboarding payment auto-confirmation ──────────────────────────────
// When Paystack calls the webhook for a CAC search fee payment, we:
//  1. Mark the OnboardingPayment as confirmed
//  2. Advance the user's onboarding stage to legal_cac_search
//  3. Create a LegalNameSearch case
//  4. Notify the customer + fan out to Legal staff
// This mirrors the manual CS confirmation flow in cs/payments/[id]/confirm/route.ts
// but runs automatically for Paystack (card) payments.
async function handleOnboardingPayment(payment: any, body: any) {
  // Idempotency
  if (payment.status === 'confirmed') {
    return NextResponse.json({
      status: 'success',
      amount: payment.amount,
      reference: payment.reference,
      message: 'Onboarding payment already confirmed.',
    });
  }

  // Determine status from gateway payload
  const gatewayStatus =
    body.status ||
    (body.data && body.data.status) ||
    'success';

  if (gatewayStatus !== 'success' && gatewayStatus !== 'successful') {
    // Payment failed — update status but don't advance
    await db.onboardingPayment.update({
      where: { id: payment.id },
      data: { status: 'failed' },
    });
    return NextResponse.json({ status: 'failed', reference: payment.reference });
  }

  // Mark as confirmed (auto — no CS staff needed for Paystack)
  await db.onboardingPayment.update({
    where: { id: payment.id },
    data: {
      status: 'confirmed',
      confirmedAt: new Date(),
      // confirmedById left null for auto-confirmed Paystack payments
    },
  });

  // Advance onboarding stage
  await db.user.update({
    where: { id: payment.userId },
    data: { onboardingStage: 'legal_cac_search' },
  }).catch(() => {});

  // Create Legal CAC Name Search case (idempotent — check if one already exists)
  const existingCase = await db.legalNameSearch.findFirst({
    where: { userId: payment.userId },
  });
  if (!existingCase) {
    await db.legalNameSearch.create({
      data: { userId: payment.userId, status: 'pending' },
    }).catch(() => {});
  }

  // Audit log
  try {
    await db.auditLog.create({
      data: {
        action: 'onboarding_payment_auto_confirmed',
        description: `Paystack auto-confirmed onboarding payment ₦${payment.amount} for user ${payment.userId} (ref: ${payment.reference})`,
        module: 'cs',
        severity: 'info',
        metadata: JSON.stringify({ paymentId: payment.id, reference: payment.reference, method: 'paystack' }),
      },
    });
  } catch {}

  // Notify customer
  void createNotification({
    userId: payment.userId,
    type: 'payment_confirmed',
    title: 'Payment Confirmed — Legal Review Starting',
    message: `Your payment of ₦${payment.amount.toLocaleString()} has been confirmed. Your application has been forwarded to the Legal department for CAC Name Search.`,
    category: 'payment',
    actionLabel: 'View Status',
    actionView: 'customer-dashboard',
  });

  // Fan out to Legal staff
  try {
    const legalStaff = await db.admin.findMany({
      where: { role: 'legal', status: 1, legalCacSearch: true },
      select: { id: true },
    });
    await Promise.all(legalStaff.map(ls =>
      createNotification({
        adminId: ls.id,
        type: 'legal_cac_search_request',
        title: 'New CAC Name Search Request',
        message: `A new CAC name search request has been received (auto-confirmed via Paystack). Please review and process.`,
        category: 'kyc',
        actionLabel: 'Review CAC Search',
        actionView: 'legal-cac-search',
      })
    ));
  } catch {}

  return NextResponse.json({
    status: 'success',
    amount: payment.amount,
    reference: payment.reference,
    autoConfirmed: true,
  });
}
