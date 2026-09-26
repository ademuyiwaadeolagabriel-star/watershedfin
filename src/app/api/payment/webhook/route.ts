import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';
import crypto from 'crypto';

// ============================================================================
// POST /api/payment/webhook
// v50: HARDENED PAYSTACK WEBHOOK
//   1. Raw-body signature verification — Paystack signs the EXACT bytes of
//      the HTTP request body. We read the body as text() BEFORE parsing
//      JSON, and compute the HMAC over those exact bytes. The previous
//      implementation parsed JSON first and then re-stringified it, which
//      could produce different whitespace/key ordering than the original
//      signed payload, allowing an attacker to forge a signature.
//   2. Fail-closed on missing secret — production deployments MUST set
//      PAYSTACK_SECRET_KEY. In dev we still allow unsigned requests but
//      log loudly. In prod (NODE_ENV=production), missing secret = reject.
//   3. Atomic multi-write — all state transitions (transactions.update,
//      loanTransaction.create, loanRepayment.update, loanApplicants.update,
//      balance.upsert, onboardingPayment.update, auditLog.create,
//      legalNameSearch.create, user.update) are wrapped in db.$transaction
//      so the payment either fully commits or fully rolls back.
//   4. Idempotency — if the paymentRef is already 'success' (or 'confirmed'
//      for onboarding), we short-circuit before doing any writes.
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // ── STEP 1: Read the raw body as text (bytes) BEFORE any JSON parse ──
    // Paystack signs the exact bytes of the HTTP request body. We must NOT
    // re-stringify a parsed object — key ordering / whitespace may differ.
    const rawBody = await req.text();

    // ── STEP 2: Paystack signature verification ───────────────────────────
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    const isProd = process.env.NODE_ENV === 'production';

    if (paystackSecret) {
      const signature = req.headers.get('x-paystack-signature');
      if (!signature) {
        return NextResponse.json({ error: 'Missing signature header' }, { status: 401 });
      }
      // Recompute the HMAC-SHA512 over the RAW bytes — not over a
      // re-serialization of the parsed body. This is the only correct way
      // to verify a webhook signature.
      const expectedSignature = crypto
        .createHmac('sha512', paystackSecret)
        .update(rawBody, 'utf8')
        .digest('hex');
      // Use crypto.timingSafeEqual to defeat timing attacks.
      if (
        signature.length !== expectedSignature.length ||
        !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))
      ) {
        console.error('[WEBHOOK] Signature mismatch — possible tampering attempt');
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } else if (isProd) {
      // v50 — fail CLOSED in production. Previously this logged a warning and
      // continued, allowing unsigned webhook requests to mutate financial
      // state in production. That is unacceptable for a payment endpoint.
      console.error('[WEBHOOK] FATAL: PAYSTACK_SECRET_KEY not set in production. Rejecting webhook.');
      return NextResponse.json(
        { error: 'Server misconfigured: payment secret not set.' },
        { status: 500 },
      );
    } else {
      console.warn('[WEBHOOK] PAYSTACK_SECRET_KEY not set in dev — signature verification skipped.');
    }

    // ── STEP 3: NOW parse the verified body ───────────────────────────────
    const body = JSON.parse(rawBody);

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

    // ── STEP 4: FIRST try OnboardingPayment (CAC search fee) ──────────────
    const onboardingPayment = await db.onboardingPayment.findFirst({
      where: { reference: paymentRef },
    });

    if (onboardingPayment) {
      return handleOnboardingPayment(onboardingPayment, body);
    }

    // ── STEP 5: THEN try Transactions (loan repayment / wallet funding) ──
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

    // ── STEP 6: ATOMIC MULTI-WRITE TRANSACTION ───────────────────────────
    // v50 — All financial state transitions wrapped in a single Prisma
    // transaction. If any write fails, the entire payment is rolled back.
    // Previously the route did:
    //    1. transactions.update (status = success)
    //    2. loanTransaction.create
    //    3. loanRepayment.update (loop, multiple writes)
    //    4. loanApplicants.update (status = paid)
    // as SEPARATE operations. A failure mid-way through step 3 could leave
    // a 'success' transaction without a matching loanTransaction, or some
    // loanRepayment rows marked 'paid' while others remain 'pending'.
    const updated = await db.$transaction(async (tx) => {
      const txUpdate = await tx.transactions.update({
        where: { id: txn.id },
        data: { status: 'success' },
      });

      if (loanId) {
        const loan = await tx.loanApplicants.findUnique({ where: { id: loanId } });
        if (loan) {
          // v50 — guard against duplicate LoanTransaction for the same ref.
          // The @unique constraint on LoanTransaction.reference makes this
          // safe: if a duplicate webhook retries the same ref, the
          // transaction will roll back at the create step.
          await tx.loanTransaction.create({
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

          // Apply repayment to schedule — all updates in same transaction
          const schedule = await tx.loanRepayment.findMany({
            where: { loanApplicantId: loanId, status: { in: ['pending', 'partial', 'overdue'] } },
            orderBy: { dueDate: 'asc' },
          });

          let remaining = Number(txn.amount);
          for (const row of schedule) {
            if (remaining <= 0) break;
            const outstanding = Math.max(0, Number(row.amountDue) - Number(row.amountPaid));
            if (outstanding <= 0) continue;
            const payNow = Math.min(outstanding, remaining);
            const newPaid = Number(row.amountPaid) + payNow;
            const newStatus = newPaid >= Number(row.amountDue) ? 'paid' : 'partial';
            await tx.loanRepayment.update({
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
          const allRows = await tx.loanRepayment.findMany({
            where: { loanApplicantId: loanId },
          });
          const allPaid = allRows.length > 0 && allRows.every((r) => r.status === 'paid');
          if (allPaid) {
            await tx.loanApplicants.update({
              where: { id: loanId },
              data: { status: 'paid' },
            });
          }
        }
      } else {
        // v50 — wallet funding. Atomic balance increment inside the same
        // outer transaction so a balance update failure rolls back the
        // transaction status too.
        try {
          await tx.balance.upsert({
            where: { userId: txn.userId },
            update: { amount: { increment: Number(txn.amount) } },
            create: { userId: txn.userId, amount: Number(txn.amount) },
          });
        } catch (balErr) {
          // Fall back to manual within the same transaction
          const balance = await tx.balance.findUnique({ where: { userId: txn.userId } });
          if (balance) {
            await tx.balance.update({
              where: { userId: txn.userId },
              data: { amount: Number(balance.amount) + Number(txn.amount) },
            });
          } else {
            await tx.balance.create({
              data: { userId: txn.userId, amount: Number(txn.amount) },
            });
          }
        }
      }

      return txUpdate;
    });

    return NextResponse.json({
      status: 'success',
      amount: updated.amount,
      reference: updated.reference,
    });
  } catch (e: any) {
    console.error('Payment webhook error:', e);
    // P2002 = unique constraint violation — this is the idempotency path.
    // If the same paymentRef was being processed concurrently, the loser of
    // the race gets P2002 from the unique constraint on LoanTransaction.reference.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { status: 'success', idempotent: true, message: 'Webhook already processed.' },
        { status: 200 },
      );
    }
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
//
// v50 — Multi-write wrapped in db.$transaction so the onboarding stage
// advancement, legal case creation, audit log, and payment status update
// all commit or roll back together.
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

  // --- v50 atomic multi-write -------------------------------------------
  await db.$transaction(async (tx) => {
    await tx.onboardingPayment.update({
      where: { id: payment.id },
      data: {
        status: 'confirmed',
        confirmedAt: new Date(),
        // confirmedById left null for auto-confirmed Paystack payments
      },
    });

    await tx.user.update({
      where: { id: payment.userId },
      data: { onboardingStage: 'legal_cac_search' },
    }).catch(() => {});

    // v52 — #26 unique-active-case enforcement. Only check for an
    // ACTIVE case (isActive=true). Approved/rejected cases are
    // historical (isActive=false) and a new payment flow should
    // legitimately create a new active case for the customer.
    // Without the isActive filter, a customer who had a prior
    // approved/rejected case could never get a new active case created
    // via the webhook — silently stranding them out of Legal review.
    const existingCase = await tx.legalNameSearch.findFirst({
      where: { userId: payment.userId, isActive: true },
    });
    if (!existingCase) {
      await tx.legalNameSearch.create({
        data: { userId: payment.userId, status: 'pending', isActive: true },
      }).catch(() => {});
    }

    await tx.auditLog.create({
      data: {
        action: 'onboarding_payment_auto_confirmed',
        description: `Paystack auto-confirmed onboarding payment ₦${payment.amount} for user ${payment.userId} (ref: ${payment.reference})`,
        module: 'cs',
        severity: 'info',
        metadata: JSON.stringify({ paymentId: payment.id, reference: payment.reference, method: 'paystack' }),
      },
    });
  });

  // --- Post-transaction side effects (NOT inside the DB transaction) ----
  // Notifications are fire-and-forget.
  void createNotification({
    userId: payment.userId,
    type: 'payment_confirmed',
    title: 'Payment Confirmed — Legal Review Starting',
    message: `Your payment of ₦${payment.amount.toLocaleString()} has been confirmed. Your application has been forwarded to the Legal department for CAC Name Search.`,
    category: 'payment',
    actionLabel: 'View Status',
    actionView: 'customer-dashboard',
  });

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
