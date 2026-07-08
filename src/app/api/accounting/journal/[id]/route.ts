import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const entry = await db.journalEntry.findUnique({
      where: { id },
      include: {
        items: { include: { account: true } },
        createdBy: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!entry) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    return NextResponse.json({ entry });
  } catch (e: any) {
    console.error('Journal GET id error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST: reverse the entry — create a counter-entry
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const original = await db.journalEntry.findUnique({
      where: { id },
      include: { items: true },
    });
    if (!original) return NextResponse.json({ error: 'Entry not found' }, { status: 404 });
    if (original.isReversed) return NextResponse.json({ error: 'Entry already reversed' }, { status: 400 });

    // Counter-entry: swap debit/credit
    const counterItems = original.items.map((it) => ({
      accountId: it.accountId,
      debit: it.credit,
      credit: it.debit,
    }));

    const reversal = await postJournal({
      date: new Date(),
      description: `REVERSAL: ${original.description}`,
      items: counterItems,
      createdById: body.createdById || undefined,
      sourceType: 'reversal',
      sourceId: original.id,
      metadata: { reversalOf: original.reference, reason: body.reason || '' },
    });

    await db.journalEntry.update({
      where: { id: original.id },
      data: { isReversed: true, reversalReason: body.reason || 'Reversed' },
    });

    return NextResponse.json({ entry: reversal });
  } catch (e: any) {
    console.error('Journal POST reverse error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
