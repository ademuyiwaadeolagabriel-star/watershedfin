import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

// POST: teller deposit — create TillTransaction type=deposit, update till balance
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { tillId, amount, reference, description, contraAccountId, customerId, createdById } = body;

    if (!tillId || !amount) return NextResponse.json({ error: 'tillId and amount required' }, { status: 400 });
    const amt = Number(amount);
    if (amt <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });

    const till = await db.till.findUnique({ where: { id: tillId } });
    if (!till) return NextResponse.json({ error: 'Till not found' }, { status: 404 });

    const txn = await db.tillTransaction.create({
      data: {
        tillId,
        type: 'deposit',
        amount: amt,
        date: new Date(),
        reference: reference || `DEP-${Date.now().toString().slice(-8)}`,
        description: description || 'Cash deposit',
        contraAccountId: contraAccountId || null,
        customerId: customerId || null,
        createdById: createdById || null,
      },
    });

    await db.till.update({
      where: { id: tillId },
      data: { currentBalance: { increment: amt }, lastActivity: new Date() },
    });

    // Journal: Dr Till GL / Cr contra
    let journalEntryId: string | undefined;
    if (contraAccountId) {
      try {
        const je = await postJournal({
          date: new Date(),
          description: `Till deposit: ${description || ''}`,
          items: [
            { accountId: till.glAccountId, debit: amt, credit: 0 },
            { accountId: contraAccountId, debit: 0, credit: amt },
          ],
          createdById: createdById || undefined,
          sourceType: 'teller',
          sourceId: txn.id,
        });
        journalEntryId = je.id;
      } catch (e) {
        console.error('Teller deposit JE failed (non-fatal):', e);
      }
    }

    return NextResponse.json({ transaction: txn, newBalance: till.currentBalance + amt, journalEntryId }, { status: 201 });
  } catch (e: any) {
    console.error('Teller deposit error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
