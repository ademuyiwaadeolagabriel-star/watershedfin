import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';

// ============================================================================
// POST /api/payment/verify
// v50: SECURE PAYMENT VERIFICATION (Paystack server-to-server)
// Body: { paymentRef }
//
// SECURITY HISTORY:
//   v49-and-earlier: This endpoint accepted an arbitrary paymentRef from
//   any caller (no auth, no Paystack call) and marked the referenced
//   transaction as 'success' — letting any attacker who could obtain or
//   guess a pending payment reference credit a loan / wallet. This was
//   the v49 #3 P0 issue.
//
// v50 FIX:
//   1. Customer JWT required — the caller must be authenticated.
//   2. The payment must belong to the authenticated customer.
//   3. If PAYSTACK_SECRET_KEY is configured, the verification is delegated
//      to Paystack's official GET /transaction/verify/:reference endpoint.
//      The local DB is only mutated when Paystack confirms the payment.
//   4. In dev (no secret), the legacy mock behavior is retained BUT only
//      for the authenticated owner of the payment — not the open public
//      endpoint that existed before.
//   5. All DB mutations are wrapped in db.$transaction so a partial failure
//      rolls back the whole verification.
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id; // v50 — derived from JWT

    const body = await req.json().catch(() => ({}));
    const { paymentRef } = body || {};

    if (!paymentRef) {
      return NextResponse.json({ error: 'paymentRef is required' }, { status: 400 });
    }

    // Find the pending payment — must belong to the authenticated customer.
    const txn = await db.transactions.findUnique({
      where: { reference: paymentRef },
    });

    if (!txn) {
      return NextResponse.json({ error: 'Payment reference not found' }, { status: 404 });
    }

    // v50 — IDOR fix: the caller can only verify payments they own.
    if (txn.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: payment does not belong to authenticated customer.' },
        { status: 403 },
      );
    }

    // Idempotency
    if (txn.status === 'success') {
      return NextResponse.json({
        status: 'success',
        amount: txn.amount,
        reference: txn.reference,
        message: 'Payment already verified.',
      });
    }

    let meta: { loanId?: string; method?: string; type?: string } = {};
    try {
      meta = txn.metadata ? JSON.parse(txn.metadata) : {};
    } catch {
      meta = {};
    }
    const loanId = meta.loanId || txn.trxRef || null;

    // --- v50: Paystack server-to-server verification (when configured) ----
    // Only mutate financial state when Paystack itself confirms the payment.
    const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
    let gatewayStatus: string;
    let gatewayAmount: number | undefined;

    if (paystackSecret) {
      const verifyUrl = `https://api.paystack.co/transaction/verify/${encodeURIComponent(paymentRef)}`;
      const gatewayResp = await fetch(verifyUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${paystackSecret}`,
          'Cache-Control': 'no-cache',
        },
      });
      if (!gatewayResp.ok) {
        console.error('[verify] Paystack call failed:', gatewayResp.status, await gatewayResp.text());
        return NextResponse.json(
          { error: 'Payment gateway verification failed.' },
          { status: 502 },
        );
      }
      const gatewayData = await gatewayResp.json() as {
        status: boolean;
        data?: { status?: string; amount?: number; reference?: string };
      };
      // Paystack returns `data.status` of 'success' for paid payments
      gatewayStatus = gatewayData.data?.status ?? 'unknown';
      gatewayAmount = gatewayData.data?.amount; // in kobo (smallest currency unit)
      if (gatewayStatus !== 'success') {
        return NextResponse.json({
          status: gatewayStatus,
          reference: paymentRef,
          message: 'Payment not yet confirmed by gateway.',
        });
      }
      // Sanity check: gateway amount (kobo → naira) must match the local record
      // v51 — Decimal arithmetic: txn.amount is Decimal, wrap with Number().
      if (gatewayAmount !== undefined && Math.abs(gatewayAmount / 100 - Number(txn.amount)) > 0.01) {
        console.error(
          `[verify] Amount mismatch: gateway ${gatewayAmount / 100} vs local ${txn.amount} for ref ${paymentRef}`,
        );
        return NextResponse.json(
          { error: 'Amount mismatch with payment gateway.' },
          { status: 400 },
        );
      }
    } else if (process.env.NODE_ENV === 'production') {
      // v50 — fail CLOSED in production. Cannot verify without Paystack secret.
      console.error('[verify] FATAL: PAYSTACK_SECRET_KEY not set in production.');
      return NextResponse.json(
        { error: 'Server misconfigured: payment secret not set.' },
        { status: 500 },
      );
    } else {
      // Dev mode — mock verify (only possible because caller is authenticated)
      gatewayStatus = 'success';
      console.warn('[verify] Dev mode — mocking Paystack success (no secret configured).');
    }

    // --- v50: ATOMIC MULTI-WRITE -------------------------------------------
    const updated = await db.$transaction(async (tx) => {
      const txUpdate = await tx.transactions.update({
        where: { id: txn.id },
        data: { status: 'success' },
      });

      if (loanId) {
        const loan = await tx.loanApplicants.findUnique({ where: { id: loanId } });
        if (loan) {
          // v50 — guard against duplicate LoanTransaction via unique ref.
          await tx.loanTransaction.create({
            data: {
              loanApplicantId: loanId,
              type: 'repayment',
              amount: txn.amount,
              reference: paymentRef,
              transactionDate: new Date(),
              metadata: JSON.stringify({
                method: meta.method || 'paystack',
                paymentRef,
                userId,
                source: 'verify',
              }),
            },
          });

          // Apply repayment to oldest unpaid / overdue schedule rows
          const schedule = await tx.loanRepayment.findMany({
            where: { loanApplicantId: loanId, status: { in: ['pending', 'partial', 'overdue'] } },
            orderBy: { dueDate: 'asc' },
          });

          let remaining = Number(txn.amount);
          for (const row of schedule) {
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
                paymentMethod: meta.method || 'paystack',
              },
            });
            remaining -= payNow;
          }

          // Check if loan is fully paid — mark as 'paid'
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

          await tx.auditLog.create({
            data: {
              action: 'verified',
              module: 'loan',
              description: `Payment ${paymentRef} verified for ₦${txn.amount.toLocaleString()} on loan ${loan.applicationRef}`,
              severity: 'info',
              metadata: JSON.stringify({ paymentRef, loanId, amount: txn.amount, source: 'paystack_verify' }),
            },
          });
        }
      } else {
        // Wallet funding — atomic increment
        try {
          await tx.balance.upsert({
            where: { userId: txn.userId },
            update: { amount: { increment: Number(txn.amount) } },
            create: { userId: txn.userId, amount: Number(txn.amount) },
          });
        } catch {
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
    console.error('Payment verify error:', e);
    if (e?.code === 'P2002') {
      // Idempotency — duplicate verify race, already processed.
      return NextResponse.json(
        { status: 'success', idempotent: true, message: 'Payment already verified.' },
        { status: 200 },
      );
    }
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
