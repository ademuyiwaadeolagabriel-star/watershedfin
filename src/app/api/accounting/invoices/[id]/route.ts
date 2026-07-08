import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const invoice = await db.invoice.findUnique({
      where: { id },
      include: { user: true, payments: true, revenueAccount: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });
    return NextResponse.json({ invoice });
  } catch (e: any) {
    console.error('Invoice GET id error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: record payment
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const { amount, paymentMethod, bankAccountId, checkNumber, notes, receivedById } = body;

    const invoice = await db.invoice.findUnique({ where: { id } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const amt = Number(amount);
    if (!amt || amt <= 0) return NextResponse.json({ error: 'Invalid amount' }, { status: 400 });

    const newTotalPaid = invoice.totalPaid + amt;
    const newStatus = newTotalPaid >= invoice.totalAmount - 0.01 ? 'paid' : 'partial';

    const reference = `IP-${invoice.invoiceNumber}-${Date.now().toString().slice(-6)}`;
    const payment = await db.invoicePayment.create({
      data: {
        reference,
        invoiceId: id,
        date: new Date(),
        amount: amt,
        bankAccountId: bankAccountId || null,
        paymentMethod: paymentMethod || null,
        checkNumber: checkNumber || null,
        notes: notes || null,
        receivedById: receivedById || null,
      },
    });

    await db.invoice.update({
      where: { id },
      data: { totalPaid: newTotalPaid, status: newStatus },
    });

    // Create journal entry: Dr Bank/Cash, Cr Accounts Receivable
    let journalEntryId: string | undefined;
    try {
      const bankAcc = bankAccountId
        ? await db.chartOfAccount.findUnique({ where: { id: bankAccountId } })
        : await db.chartOfAccount.findFirst({ where: { OR: [{ subType: 'bank' }, { subType: 'cash' }] } });
      const arAcc = await db.chartOfAccount.findFirst({
        where: { OR: [{ subType: 'accounts_receivable' }, { name: { contains: 'receivable', mode: 'insensitive' } }] },
      });
      if (bankAcc && arAcc) {
        const je = await postJournal({
          date: new Date(),
          description: `Invoice payment ${invoice.invoiceNumber}`,
          items: [
            { accountId: bankAcc.id, debit: amt, credit: 0 },
            { accountId: arAcc.id, debit: 0, credit: amt },
          ],
          createdById: receivedById || undefined,
          sourceType: 'invoice',
          sourceId: invoice.id,
        });
        journalEntryId = je.id;
        await db.invoicePayment.update({ where: { id: payment.id }, data: { journalEntryId: je.id } });
      }
    } catch (jeErr) {
      console.error('Invoice payment JE failed (non-fatal):', jeErr);
    }

    return NextResponse.json({ payment, invoiceId: id, newStatus, newTotalPaid, journalEntryId });
  } catch (e: any) {
    console.error('Invoice payment POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
