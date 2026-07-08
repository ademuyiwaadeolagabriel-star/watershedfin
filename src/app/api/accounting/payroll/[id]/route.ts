import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const batch = await db.payrollBatch.findUnique({
      where: { id },
      include: {
        payslips: { include: { payrollBatch: { select: { period: true } } } },
        paymentAccount: true,
        salaryExpenseAccount: true,
        processedBy: { select: { firstName: true, lastName: true } },
        approvedBy: { select: { firstName: true, lastName: true } },
      },
    });
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    return NextResponse.json({ batch });
  } catch (e: any) {
    console.error('Payroll GET id error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: approve — generate journal entry Dr Salary Expense / Cr Bank
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const batch = await db.payrollBatch.findUnique({ where: { id } });
    if (!batch) return NextResponse.json({ error: 'Batch not found' }, { status: 404 });
    if (batch.status !== 'pending') {
      return NextResponse.json({ error: `Batch already ${batch.status}` }, { status: 400 });
    }

    // Find accounts
    const expenseAcc = batch.salaryExpenseAccountId
      ? await db.chartOfAccount.findUnique({ where: { id: batch.salaryExpenseAccountId } })
      : await db.chartOfAccount.findFirst({ where: { OR: [{ subType: 'salary_expense' }, { name: { contains: 'salary', mode: 'insensitive' } }] } });
    const bankAcc = batch.paymentAccountId
      ? await db.chartOfAccount.findUnique({ where: { id: batch.paymentAccountId } })
      : await db.chartOfAccount.findFirst({ where: { OR: [{ subType: 'bank' }, { subType: 'cash' }] } });

    let journalEntryId: string | undefined;
    if (expenseAcc && bankAcc) {
      const je = await postJournal({
        date: new Date(),
        description: `Payroll for ${batch.period} (${batch.staffCount} staff)`,
        items: [
          { accountId: expenseAcc.id, debit: batch.netPay, credit: 0 },
          { accountId: bankAcc.id, debit: 0, credit: batch.netPay },
        ],
        createdById: body.approvedById || undefined,
        sourceType: 'payroll',
        sourceId: batch.id,
      });
      journalEntryId = je.id;
    }

    const updated = await db.payrollBatch.update({
      where: { id },
      data: {
        status: 'paid',
        approvedById: body.approvedById || null,
        approvedAt: new Date(),
        journalEntryId: journalEntryId || null,
      },
    });
    await db.payslip.updateMany({ where: { payrollBatchId: id }, data: { status: 'paid' } });

    return NextResponse.json({ batch: updated, journalEntryId });
  } catch (e: any) {
    console.error('Payroll approve POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
