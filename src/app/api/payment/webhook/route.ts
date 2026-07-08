import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/payment/webhook
// Mock webhook handler — same as verify but for gateway callbacks.
// In production this endpoint would be called by the payment gateway (Paystack,
// Flutterwave, Moniepoint etc.) after the customer completes checkout.
// We accept { paymentRef, event, status } or a raw gateway payload.
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
