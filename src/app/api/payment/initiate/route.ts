import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import crypto from 'crypto';
// ============================================================================
// POST /api/payment/initiate
// Authorization: Bearer <customer-jwt>
// Body: { amount, method: 'card'|'bank_transfer'|'ussd', loanId?, type: 'loan_repayment'|'wallet_funding' }
//
// v50 FIX (Issue #7): Customer identity comes from the JWT, NOT from
// `body.userId`. Previously any caller could initiate a payment under
// any user's identity, potentially creating spurious pending transactions
// on another user's record.
//
// If `loanId` is provided, the loan must belong to the authenticated
// customer. Otherwise the request is rejected with 403.
//
// Payment reference generation moved to crypto.randomBytes for
// non-deterministic, non-guessable refs (previously Math.random).
// ============================================================================

function generatePaymentRef(): string {
  // v50 — cryptographically secure ref. Math.random() output was
  // 1) not uniformly distributed among the 32-char alphabet, and
  // 2) guessable by an attacker. crypto.randomBytes is the correct primitive.
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const bytes = crypto.randomBytes(6);
  let out = 'PAY-';
  for (let i = 0; i < 6; i++) out += chars[bytes[i] % chars.length];
  // Append a millisecond timestamp + random tail to ensure uniqueness even
  // in the (astronomically unlikely) case of byte collision.
  return out + '-' + Date.now().toString(36).toUpperCase().slice(-4);
}

export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id; // v50 — derived from JWT

    const body = await req.json().catch(() => ({}));
    const { amount, method, loanId, type } = body || {};

    if (!amount || Number(amount) <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number' }, { status: 400 });
    }
    if (!method || !['card', 'bank_transfer', 'ussd'].includes(method)) {
      return NextResponse.json(
        { error: "method must be one of 'card', 'bank_transfer', 'ussd'" },
        { status: 400 },
      );
    }
    if (type && !['loan_repayment', 'wallet_funding'].includes(type)) {
      return NextResponse.json(
        { error: "type must be one of 'loan_repayment', 'wallet_funding'" },
        { status: 400 },
      );
    }

    // Validate user exists (sanity check — JWT already proved identity)
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If loanId provided, validate loan belongs to the authenticated user
    if (loanId) {
      const loan = await db.loanApplicants.findUnique({ where: { id: loanId } });
      if (!loan) {
        return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
      }
      if (loan.userId !== userId) {
        return NextResponse.json(
          { error: 'Forbidden: loan does not belong to authenticated customer.' },
          { status: 403 },
        );
      }
    }

    const paymentRef = generatePaymentRef();
    const paymentType = type || (loanId ? 'loan_repayment' : 'wallet_funding');

    await db.transactions.create({
      data: {
        userId,
        type: paymentType === 'loan_repayment' ? 'loan_repaid' : 'deposit',
        amount: Number(amount),
        charge: 0,
        status: 'pending',
        reference: paymentRef,
        trxRef: loanId || null,
        gatewayId: 'mock-gateway',
        metadata: JSON.stringify({
          method,
          type: paymentType,
          loanId: loanId || null,
          initiatedAt: new Date().toISOString(),
        }),
      },
    });

    return NextResponse.json({
      paymentRef,
      amount: Number(amount),
      method,
      status: 'pending',
      checkoutUrl: null,
      message: 'Payment initiated. In demo mode, all payments auto-succeed.',
    });
  } catch (e: any) {
    console.error('Payment initiate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
