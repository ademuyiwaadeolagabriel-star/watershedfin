import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { generateInvoiceNumber } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const where: any = {};
    if (status && status !== 'all') where.status = status;
    const invoices = await db.invoice.findMany({
      where,
      orderBy: { date: 'desc' },
      take: 200,
      include: {
        user: { select: { id: true, firstName: true, lastName: true, email: true } },
        payments: true,
      },
    });
    return NextResponse.json({ invoices });
  } catch (e: any) {
    console.error('Invoices GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, date, dueDate, lineItems, taxRate, notes, revenueAccountId, description } = body;

    if (!dueDate) return NextResponse.json({ error: 'dueDate required' }, { status: 400 });

    const items = Array.isArray(lineItems) ? lineItems : [];
    const subtotal = items.reduce((s: number, i: any) => s + Number(i.amount || 0), 0);
    const taxAmount = (subtotal * (Number(taxRate) || 0)) / 100;
    const totalAmount = subtotal + taxAmount;

    const invoiceNumber = await generateInvoiceNumber(date ? new Date(date) : new Date());

    const invoice = await db.invoice.create({
      data: {
        invoiceNumber,
        userId: userId || null,
        date: date ? new Date(date) : new Date(),
        dueDate: new Date(dueDate),
        description: description || (items[0]?.description ? String(items[0].description) : null),
        subtotal,
        taxAmount,
        totalAmount,
        totalPaid: 0,
        notes: notes || (items.length ? JSON.stringify(items) : null),
        status: 'sent',
        revenueAccountId: revenueAccountId || null,
      },
      include: { user: true },
    });

    return NextResponse.json({ invoice }, { status: 201 });
  } catch (e: any) {
    console.error('Invoice POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
