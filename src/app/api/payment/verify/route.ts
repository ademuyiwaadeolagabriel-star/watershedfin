import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/payment/verify
// Body: { paymentRef }
// Mock: marks payment as success, creates LoanTransaction if loanId was passed
// during initiation, and updates the loan repayment schedule.
// Returns: { status, amount, reference }
// ============================================================================

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { paymentRef } = body;

    if (!paymentRef) {
      return NextResponse.json({ error: 'paymentRef is required' }, { status: 400 });
    }

    // Find the pending payment
    const txn = await db.transactions.findUnique({
      where: { reference: paymentRef },
    });

    if (!txn) {
      return NextResponse.json({ error: 'Payment reference not found' }, { status: 404 });
    }

    if (txn.status === 'success') {
      return NextResponse.json({
        status: 'success',
        amount: txn.amount,
        reference: txn.reference,
        message: 'Payment already verified.',
      });
    }

    // Parse metadata to find loanId (if any)
    let meta: { loanId?: string; method?: string; type?: string } = {};
    try {
      meta = txn.metadata ? JSON.parse(txn.metadata) : {};
    } catch {
      meta = {};
    }
    const loanId = meta.loanId || txn.trxRef || null;

    // Update the gateway transaction to success
    const updated = await db.transactions.update({
      where: { id: txn.id },
      data: { status: 'success' },
    });

    // If loan repayment, also create a LoanTransaction and update schedule
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
              method: meta.method || 'mock',
              paymentRef,
              userId: txn.userId,
            }),
          },
        });

        // Apply repayment to the oldest unpaid / overdue schedule rows
        const schedule = await db.loanRepayment.findMany({
          where: { loanApplicantId: loanId, status: { in: ['pending', 'partial', 'overdue'] } },
          orderBy: { dueDate: 'asc' },
        });

        let remaining = txn.amount;
        for (const row of schedule) {
          if (remaining <= 0) break;
          const due = row.amountDue;
          const alreadyPaid = row.amountPaid;
          const outstanding = Math.max(0, due - alreadyPaid);
          if (outstanding <= 0) continue;
          const payNow = Math.min(outstanding, remaining);
          const newPaid = alreadyPaid + payNow;
          const newStatus = newPaid >= due ? 'paid' : 'partial';
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

        // Check if loan is fully paid — mark as 'paid'
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

        // Audit log
        await db.auditLog.create({
          data: {
            action: 'verified',
            module: 'loan',
            description: `Payment ${paymentRef} verified for ₦${txn.amount.toLocaleString()} on loan ${loan.applicationRef}`,
            severity: 'info',
            metadata: JSON.stringify({ paymentRef, loanId, amount: txn.amount }),
          },
        });
      }
    } else {
      // Wallet funding — credit the user's balance
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
    console.error('Payment verify error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
