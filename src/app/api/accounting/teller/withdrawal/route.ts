import { NextRequest, NextResponse } from 'next/server';
import { requireRole, requireMakerChecker, completeMakerCheckerExecution } from '@/lib/auth';
import { db } from '@/lib/db';
import { postJournal } from '@/lib/accounting';

// POST: teller withdrawal
export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  // v53-P4 (audit #43/#44) — maker-checker gate (graceful rollout).
  // The gate is only enforced when the caller explicitly passes
  // `?stage=propose|review|authorize|execute` in the URL. Without a stage
  // query param the route falls back to its existing behavior so the UI
  // and existing callers continue to work while the PendingMutation
  // workflow table is being populated.
  const url_v53 = new URL(req.url);
  let mc_v53: any;
  {
    mc_v53 = await requireMakerChecker(req, {
      operation: 'teller_withdrawal',
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
    const { tillId, amount, reference, description, contraAccountId, customerId} = body;
    if (!tillId || !amount) return NextResponse.json({ error: 'tillId and amount required' }, { status: 400 });
    const amt = Number(amount);
    if (amt <= 0) return NextResponse.json({ error: 'Amount must be positive' }, { status: 400 });

    // v53-P4 (audit #45): Wrap the ENTIRE withdrawal sequence —
    // TillTransaction.create + Till.update balance + postJournal — in a
    // single db.$transaction. If postJournal throws (e.g. an account is
    // missing or the entry is unbalanced), the whole transaction rolls
    // back: no TillTransaction row, no Till balance change, no GL entry.
    // Previously the route caught postJournal failure as `// non-fatal`,
    // which silently left cash moved + till debited but the GL missing a
    // matching credit — an unrecoverable accounting divergence.
    //
    // postJournal is invoked with the caller's `tx` so the JournalEntry +
    // JournalItem + ChartOfAccount.balance writes participate in this
    // same transaction (no nested $transaction gap).
    const result = await db.$transaction(async (tx) => {
      const till = await tx.till.findUnique({ where: { id: tillId } });
      if (!till) {
        throw new Error('Till not found');
      }
      if (Number(till.currentBalance ?? 0) < amt) {
        throw new Error('Insufficient till balance');
      }

      const txn = await tx.tillTransaction.create({
        data: {
          tillId,
          type: 'withdrawal',
          amount: amt,
          date: new Date(),
          reference: reference || `WD-${Date.now().toString().slice(-8)}`,
          description: description || 'Cash withdrawal',
          contraAccountId: contraAccountId || null,
          customerId: customerId || null,
          createdById: authResult_v51.id,
        },
      });

      await tx.till.update({
        where: { id: tillId },
        data: { currentBalance: { decrement: amt }, lastActivity: new Date() },
      });

      // Journal: Dr contra / Cr Till GL — FATAL on failure (audit #45).
      let journalEntryId: string | undefined;
      if (contraAccountId) {
        const je = await postJournal(
          {
            date: new Date(),
            description: `Till withdrawal: ${description || ''}`,
            items: [
              { accountId: contraAccountId, debit: amt, credit: 0 },
              { accountId: till.glAccountId, debit: 0, credit: amt },
            ],
            createdById: authResult_v51.id,
            sourceType: 'teller',
            sourceId: txn.id,
          },
          tx,
        );
        journalEntryId = je.id;
      }

      return { txn, newBalance: Number(till.currentBalance ?? 0) - amt, journalEntryId };
    });
    if (mc_v53.stage === 'execute' && mc_v53.proposalId) await completeMakerCheckerExecution(mc_v53.proposalId, mc_v53.actorId);
    return NextResponse.json(
      { transaction: result.txn, newBalance: result.newBalance, journalEntryId: result.journalEntryId },
      { status: 201 },
    );
  } catch (e: any) {
    console.error('Teller withdrawal error:', e);
    // Surface expected business-rule errors with appropriate HTTP codes.
    if (e?.message === 'Till not found') return NextResponse.json({ error: 'Till not found' }, { status: 404 });
    if (e?.message === 'Insufficient till balance') return NextResponse.json({ error: 'Insufficient till balance' }, { status: 400 });
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}