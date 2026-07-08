import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateBillNumber, postJournal } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    const bills = await db.vendorBill.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: { vendor: true, payments: true, expenseAccount: true },
    });
    return NextResponse.json({ bills });
  } catch (e: any) {
    console.error('Bills GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { vendorId, date, dueDate, subtotal, taxAmount, totalAmount, expenseAccountId, description, createdById } = body;

    if (!vendorId || !dueDate) return NextResponse.json({ error: 'vendorId, dueDate required' }, { status: 400 });
    const sub = Number(subtotal) || 0;
    const tax = Number(taxAmount) || 0;
    const total = Number(totalAmount) || sub + tax;

    const billNumber = await generateBillNumber();
    const bill = await db.vendorBill.create({
      data: {
        billNumber,
        vendorId,
        date: date ? new Date(date) : new Date(),
        dueDate: new Date(dueDate),
        subtotal: sub,
        taxAmount: tax,
        totalAmount: total,
        totalPaid: 0,
        expenseAccountId: expenseAccountId || null,
        description: description || null,
        status: 'pending',
        createdById: createdById || null,
      },
      include: { vendor: true },
    });

    // Post journal: Dr Expense / Cr Accounts Payable
    try {
      const apAcc = await db.chartOfAccount.findFirst({
        where: { OR: [{ subType: 'accounts_payable' }, { name: { contains: 'payable', mode: 'insensitive' } }] },
      });
      if (expenseAccountId && apAcc) {
        const je = await postJournal({
          date: bill.date,
          description: `Vendor bill ${billNumber} - ${bill.vendor?.name || ''}`,
          items: [
            { accountId: expenseAccountId, debit: total, credit: 0 },
            { accountId: apAcc.id, debit: 0, credit: total },
          ],
          createdById: createdById || undefined,
          sourceType: 'vendor_bill',
          sourceId: bill.id,
        });
        await db.vendorBill.update({ where: { id: bill.id }, data: { journalEntryId: je.id } });
      }
    } catch (jeErr) {
      console.error('Bill JE failed (non-fatal):', jeErr);
    }

    return NextResponse.json({ bill }, { status: 201 });
  } catch (e: any) {
    console.error('Bill POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
