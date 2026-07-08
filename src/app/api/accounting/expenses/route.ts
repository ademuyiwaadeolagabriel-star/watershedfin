import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
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
        paymentAccount: true,
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
