import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const take = parseInt(url.searchParams.get('take') || '100');

    const where: any = {};
    if (from || to) {
      where.date = {};
      if (from) where.date.gte = new Date(from);
      if (to) {
        const t = new Date(to);
        t.setHours(23, 59, 59, 999);
        where.date.lte = t;
      }
    }

    const entries = await db.journalEntry.findMany({
      where,
      orderBy: { date: 'desc' },
      take,
      include: {
        items: { include: { account: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    return NextResponse.json({ entries });
  } catch (e: any) {
    console.error('Journal GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { date, description, items, createdById, sourceType, sourceId, metadata } = body;

    if (!description || !Array.isArray(items) || items.length < 2) {
      return NextResponse.json({ error: 'description and at least 2 line items required' }, { status: 400 });
    }

    const totalDebit = items.reduce((s: number, i: any) => s + Number(i.debit || 0), 0);
    const totalCredit = items.reduce((s: number, i: any) => s + Number(i.credit || 0), 0);
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      return NextResponse.json(
        { error: `Unbalanced: debit ${totalDebit} vs credit ${totalCredit}` },
        { status: 400 }
      );
    }

    const entry = await postJournal({
      date: date ? new Date(date) : new Date(),
      description,
      items: items.map((i: any) => ({ accountId: i.accountId, debit: Number(i.debit || 0), credit: Number(i.credit || 0) })),
      createdById: createdById || undefined,
      sourceType: sourceType || 'manual',
      sourceId: sourceId || undefined,
      metadata,
    });

    return NextResponse.json({ entry }, { status: 201 });
  } catch (e: any) {
    console.error('Journal POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
