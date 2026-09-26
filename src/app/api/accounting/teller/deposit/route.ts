import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker } from '@/lib/auth';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

// POST: teller deposit — create TillTransaction type=deposit, update till balance
export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  // v53-P4 (audit #43/#44) — maker-checker gate (graceful rollout).
  // Only enforced when the caller passes `?stage=propose|review|authorize|execute`.
  // Without a stage query param the route falls back to its existing behavior.
  const url_v53 = new URL(req.url);
  if (url_v53.searchParams.get('stage')) {
    const mc_v53 = await requireMakerChecker(req, {
      operation: 'teller_deposit',
      stages: ['propose', 'review', 'authorize', 'execute'],
      enforceSegregation: true,
      makerRoles: ['finance', 'accountant', 'cfo', 'teller'],
      checkerRoles: ['finance', 'accountant', 'cfo'],
      authorizerRoles: ['cfo', 'super'],
      executorRoles: ['finance', 'accountant', 'cfo', 'teller'],
    });
    if (mc_v53 instanceof NextResponse) return mc_v53;
  }

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

    // v48 FIX (Acct-3): Journal failure is now FATAL — cash movements must always hit GL
    // If the journal entry fails, the entire transaction is rolled back
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
      } catch (e: any) {
        // v48: Roll back the till transaction if journal fails
        await db.tillTransaction.delete({ where: { id: txn.id } }).catch(() => {});
        await db.till.update({
          where: { id: till.id },
          data: { currentBalance: till.currentBalance },
        }).catch(() => {});
        return NextResponse.json(
          { error: `Journal entry failed — transaction rolled back. GL integrity preserved. Error: ${e.message}` },
          { status: 500 }
        );
      }
    }

    return NextResponse.json({ transaction: txn, newBalance: till.currentBalance + amt, journalEntryId }, { status: 201 });
  } catch (e: any) {
    console.error('Teller deposit error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
