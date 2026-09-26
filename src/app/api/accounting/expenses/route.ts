import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    const expenses = await db.expense.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: {
        expenseAccount: true,
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({ expenses });
  } catch (e: any) {
    console.error('Expenses GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  // v53-P4 (audit #43/#44) — maker-checker gate (graceful rollout).
  // Only enforced when the caller passes `?stage=propose|review|authorize|execute`.
  // Without a stage query param the route falls back to its existing behavior.
  const url_v53 = new URL(req.url);
  if (url_v53.searchParams.get('stage')) {
    const mc_v53 = await requireMakerChecker(req, {
      operation: 'expense_post',
      stages: ['propose', 'review', 'authorize', 'execute'],
      enforceSegregation: true,
      makerRoles: ['finance', 'accountant', 'cfo'],
      checkerRoles: ['finance', 'accountant', 'cfo'],
      authorizerRoles: ['cfo', 'super'],
      executorRoles: ['finance', 'accountant', 'cfo'],
    });
    if (mc_v53 instanceof NextResponse) return mc_v53;
  }

  try {
    const body = await req.json();
    const { date, description, amount, expenseAccountId, paymentAccountId, category, reference, receiptNumber, notes, createdById } = body;

    if (!description || !amount || !expenseAccountId) {
      return NextResponse.json({ error: 'description, amount, expenseAccountId required' }, { status: 400 });
    }

    const expense = await db.expense.create({
      data: {
        date: date ? new Date(date) : new Date(),
        description,
        amount: Number(amount),
        expenseAccountId,
        paymentAccountId: paymentAccountId || null,
        category: category || null,
        reference: reference || null,
        receiptNumber: receiptNumber || null,
        notes: notes || null,
        status: 'pending',
        createdById: createdById || null,
      },
      include: { expenseAccount: true },
    });
    return NextResponse.json({ expense }, { status: 201 });
  } catch (e: any) {
    console.error('Expense POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
