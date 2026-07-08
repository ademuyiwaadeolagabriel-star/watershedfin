import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

// POST: record vendor bill payment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { amount, paymentDate, paymentMethod, referenceNumber, bankAccountId, notes, createdById } = body;

    const bill = await db.vendorBill.findUnique({ where: { id }, include: { vendor: true } });
    if (!bill) return NextResponse.json({ error: 'Bill not found' }, { status: 404 });

    const amt = Number(amount);
    if (!amt || amt <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

    const newTotalPaid = bill.totalPaid + amt;
    const newStatus = newTotalPaid >= bill.totalAmount - 0.01 ? 'paid' : 'partial';

    const payment = await db.vendorPayment.create({
      data: {
        vendorBillId: id,
        vendorId: bill.vendorId,
        paymentDate: paymentDate ? new Date(paymentDate) : new Date(),
        amount: amt,
        paymentMethod: paymentMethod || null,
        referenceNumber: referenceNumber || null,
        bankAccountId: bankAccountId || null,
        notes: notes || null,
        createdById: createdById || null,
      },
    });

    await db.vendorBill.update({
      where: { id },
      data: { totalPaid: newTotalPaid, status: newStatus },
    });

    // Journal: Dr Accounts Payable / Cr Bank
    let journalEntryId: string | undefined;
    try {
      const apAcc = await db.chartOfAccount.findFirst({
        where: { OR: [{ subType: 'accounts_payable' }, { name: { contains: 'payable', mode: 'insensitive' } }] },
      });
      const bankAcc = bankAccountId
        ? await db.chartOfAccount.findUnique({ where: { id: bankAccountId } })
        : await db.chartOfAccount.findFirst({ where: { OR: [{ subType: 'bank' }, { subType: 'cash' }] } });
      if (apAcc && bankAcc) {
        const je = await postJournal({
          date: payment.paymentDate,
          description: `Bill payment ${bill.billNumber} - ${bill.vendor?.name || ''}`,
          items: [
            { accountId: apAcc.id, debit: amt, credit: 0 },
            { accountId: bankAcc.id, debit: 0, credit: amt },
          ],
          createdById: createdById || undefined,
          sourceType: 'vendor_payment',
          sourceId: payment.id,
        });
        journalEntryId = je.id;
        await db.vendorPayment.update({ where: { id: payment.id }, data: { journalEntryId: je.id } });
      }
    } catch (jeErr) {
      console.error('Bill payment JE failed (non-fatal):', jeErr);
    }

    return NextResponse.json({ payment, billId: id, newStatus, newTotalPaid, journalEntryId });
  } catch (e: any) {
    console.error('Bill pay error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
