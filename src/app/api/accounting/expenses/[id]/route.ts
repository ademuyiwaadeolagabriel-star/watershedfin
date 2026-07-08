import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

// PUT: approve or reject
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const action = body.action; // approve | reject
    const expense = await db.expense.findUnique({ where: { id } });
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });
    if (expense.status !== 'pending') {
      return NextResponse.json({ error: `Expense already ${expense.status}` }, { status: 400 });
    }

    if (action === 'reject') {
      const updated = await db.expense.update({
        where: { id },
        data: { status: 'rejected' },
      });
      return NextResponse.json({ expense: updated });
    }

    if (action === 'approve') {
      const updated = await db.expense.update({
        where: { id },
        data: { status: 'approved' },
      });
      // Post journal: Dr Expense / Cr Cash/Bank
      try {
        const payAcc = expense.paymentAccountId
          ? await db.chartOfAccount.findUnique({ where: { id: expense.paymentAccountId } })
          : await db.chartOfAccount.findFirst({ where: { OR: [{ subType: 'bank' }, { subType: 'cash' }] } });
        if (payAcc) {
          const je = await postJournal({
            date: new Date(),
            description: `Expense: ${expense.description}`,
            items: [
              { accountId: expense.expenseAccountId, debit: expense.amount, credit: 0 },
              { accountId: payAcc.id, debit: 0, credit: expense.amount },
            ],
            createdById: body.approvedById || undefined,
            sourceType: 'expense',
            sourceId: expense.id,
          });
          await db.expense.update({ where: { id }, data: { status: 'paid' } });
          return NextResponse.json({ expense: { ...updated, status: 'paid' }, journalEntryId: je.id });
        }
      } catch (jeErr) {
        console.error('Expense JE failed (non-fatal):', jeErr);
      }
      return NextResponse.json({ expense: updated });
    }

    return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
  } catch (e: any) {
    console.error('Expense PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
