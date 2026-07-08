import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

// POST: teller withdrawal
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tillId, amount, reference, description, contraAccountId, customerId, createdById } = body;

    if (!tillId || !amount) return NextResponse.json({ error: 'tillId and amount required' }, { status: 400 });
    const amt = Number(amount);
    if (amt <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });

    const till = await db.till.findUnique({ where: { id: tillId } });
    if (!till) return NextResponse.json({ error: 'Till not found' }, { status: 404 });
    if (till.currentBalance < amt) {
      return NextResponse.json({ error: 'Insufficient till balance' }, { status: 400 });
    }

    const txn = await db.tillTransaction.create({
      data: {
        tillId,
        type: 'withdrawal',
        amount: amt,
        date: new Date(),
        reference: reference || `WD-${Date.now().toString().slice(-8)}`,
        description: description || 'Cash withdrawal',
        contraAccountId: contraAccountId || null,
        customerId: customerId || null,
        createdById: createdById || null,
      },
    });

    await db.till.update({
      where: { id: tillId },
      data: { currentBalance: { decrement: amt }, lastActivity: new Date() },
    });

    // Journal: Dr contra / Cr Till GL
    let journalEntryId: string | undefined;
    if (contraAccountId) {
      try {
        const je = await postJournal({
          date: new Date(),
          description: `Till withdrawal: ${description || ''}`,
          items: [
            { accountId: contraAccountId, debit: amt, credit: 0 },
            { accountId: till.glAccountId, debit: 0, credit: amt },
          ],
          createdById: createdById || undefined,
          sourceType: 'teller',
          sourceId: txn.id,
        });
        journalEntryId = je.id;
      } catch (e) {
        console.error('Teller withdrawal JE failed (non-fatal):', e);
      }
    }

    return NextResponse.json({ transaction: txn, newBalance: till.currentBalance - amt, journalEntryId }, { status: 201 });
  } catch (e: any) {
    console.error('Teller withdrawal error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
