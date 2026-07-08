import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/payment/initiate
// Body: { userId, amount, method: 'card'|'bank_transfer'|'ussd', loanId?, type: 'loan_repayment'|'wallet_funding' }
// Mock payment gateway. All payments auto-succeed in demo mode.
// ============================================================================

function generatePaymentRef(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let out = 'PAY-';
  for (let i = 0; i < 6; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, amount, method, loanId, type } = body;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
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

    // Validate user exists
    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If loanId provided, validate loan belongs to user
    if (loanId) {
      const loan = await db.loanApplicants.findUnique({ where: { id: loanId } });
      if (!loan) {
        return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
      }
      if (loan.userId !== userId) {
        return NextResponse.json({ error: 'Loan does not belong to user' }, { status: 403 });
      }
    }

    const paymentRef = generatePaymentRef();
    const paymentType = type || (loanId ? 'loan_repayment' : 'wallet_funding');

    // Persist a pending transaction so verify()/webhook() can find it
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
