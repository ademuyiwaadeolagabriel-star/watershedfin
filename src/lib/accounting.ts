// Accounting domain helpers (server-side only)
import { db } from '@/lib/db';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';

// v49: Reference generation now uses UUID suffix instead of count+1
// This eliminates the race condition where two simultaneous requests
// both calculate count=7 and both generate ...-008.

// Generate journal reference: JE-YYYYMMDD-XXXX (UUID-based, no race)
export async function generateJournalReference(date?: Date): Promise<string> {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const suffix = randomUUID().split('-')[0].toUpperCase(); // 8-char hex
  return `JE-${y}${m}${day}-${suffix}`;
}

// Generate invoice number: INV-YYYYMMDD-XXXX
export async function generateInvoiceNumber(date?: Date): Promise<string> {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const suffix = randomUUID().split('-')[0].toUpperCase();
  return `INV-${y}${m}${day}-${suffix}`;
}

export async function generateBillNumber(): Promise<string> {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const suffix = randomUUID().split('-')[0].toUpperCase();
  return `BILL-${y}${m}-${suffix}`;
}

export async function generatePayslipNumber(period: string): Promise<string> {
  const suffix = randomUUID().split('-')[0].toUpperCase();
  return `PS-${period.replace(/-/g, '')}-${suffix}`;
}

// Normal balance side
export function isDebitNormal(type: string): boolean {
  return type === 'asset' || type === 'expense';
}

// Apply a journal item's effect to the account balance
export function applyToBalance(currentBalance: number, type: string, debit: number, credit: number): number {
  if (isDebitNormal(type)) {
    return currentBalance + (debit - credit);
  }
  return currentBalance + (credit - debit);
}

/**
 * v53-P4 (audit #46): Compute the SIGNED net balance change for a journal
 * item, accounting for the account's normal balance side.
 *
 * For a debit-normal account (asset/expense): debits increase the balance
 * (positive delta), credits decrease it (negative delta).
 *
 * For a credit-normal account (liability/equity/revenue): credits increase
 * the balance (positive delta), debits decrease it (negative delta).
 *
 * This signed value can be passed directly to Prisma's `increment` operator,
 * which performs an atomic SQL `UPDATE ... SET balance = balance + delta`.
 * A negative delta automatically decrements the column. This eliminates the
 * read-then-write lost-update race that the previous implementation had.
 */
export function signedBalanceDelta(type: string, debit: number, credit: number): number {
  return applyToBalance(0, type, debit, credit);
}

// v49: Post a journal entry and update account balances ATOMICALLY using $transaction
// v53-P4 (audit #46): Balance updates now use Prisma `increment` for atomicity.
// v53-P4 (audit #45/#47): Accepts an optional `tx` so callers that already
// have an open `db.$transaction` can include the JE write + balance update
// in the SAME outer transaction (no nested-transaction gap).
export async function postJournal(
  params: {
    date: Date;
    description: string;
    // v51 — debit/credit typed as `any` because Prisma returns Decimal for
    // these fields; callers may pass either Decimal or number. The Number()
    // coercion inside this function handles both shapes safely.
    items: { accountId: string; debit: any; credit: any }[];
    createdById?: string;
    sourceType?: string;
    sourceId?: string;
    metadata?: any;
  },
  tx?: Prisma.TransactionClient,
) {
  const totalDebit = params.items.reduce((s, i) => s + Number(i.debit || 0), 0);
  const totalCredit = params.items.reduce((s, i) => s + Number(i.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Unbalanced entry: debit ${totalDebit} != credit ${totalCredit}`);
  }

  const reference = await generateJournalReference(params.date);

  // If a caller-provided transaction client is present, we are ALREADY inside
  // a `db.$transaction` callback. We must NOT open a nested `$transaction`
  // (Prisma does not support nested interactive transactions and would throw
  // or silently detach the writes). Instead, run the JE + balance update
  // inline against the caller's `tx` so any failure rolls back the OUTER
  // transaction too (audit #45 / #47).
  if (tx) {
    return runPostJournal(tx, params, reference);
  }

  // v49: Wrap ALL writes in a single database transaction
  // If any account balance update fails, the journal entry is also rolled back
  return db.$transaction(async (innerTx) => runPostJournal(innerTx, params, reference));
}

// Shared inner routine used both by the standalone postJournal (own $transaction)
// and by the caller-tx path. Operates against the provided transaction client.
async function runPostJournal(
  tx: Prisma.TransactionClient,
  params: {
    date: Date;
    description: string;
    items: { accountId: string; debit: any; credit: any }[];
    createdById?: string;
    sourceType?: string;
    sourceId?: string;
    metadata?: any;
  },
  reference: string,
) {
  // Create journal entry + items in one nested write
  const je = await tx.journalEntry.create({
    data: {
      reference,
      date: params.date,
      description: params.description,
      createdById: params.createdById || null,
      posted: true,
      sourceType: params.sourceType || 'manual',
      sourceId: params.sourceId || null,
      metadata: params.metadata ? JSON.stringify(params.metadata) : null,
      items: {
        create: params.items.map((it) => ({
          accountId: it.accountId,
          debit: Number(it.debit || 0),
          credit: Number(it.credit || 0),
        })),
      },
    },
    include: { items: { include: { account: true } } },
  });

  // v53-P4 (audit #46): ATOMIC balance update via Prisma `increment`.
  // Previously: read account.balance → compute newBal → write newBal.
  // That read-then-write pattern is a lost-update race: two concurrent
  // postings to the same account could both read balance=100, both compute
  // 100 + 50 = 150, and the second write would clobber the first (final
  // balance 150 instead of 200).
  //
  // Now: a single SQL `UPDATE chart_of_account SET balance = balance + ?`
  // issued per item. The DB acquires the row lock for the duration of the
  // UPDATE, so concurrent transactions serialize on the same row. No
  // application-level read of `balance` is needed.
  //
  // We still issue a `findUnique` to read the account's TYPE (asset vs
  // liability, etc.) — type is a slowly-changing attribute that does not
  // race with balance updates. Reading type alone is safe.
  for (const it of je.items) {
    const acc = await tx.chartOfAccount.findUnique({ where: { id: it.accountId } });
    if (!acc) continue;
    const delta = signedBalanceDelta(acc.type, Number(it.debit), Number(it.credit));
    // Prisma `increment` accepts signed values; a negative delta decrements.
    await tx.chartOfAccount.update({
      where: { id: acc.id },
      data: { balance: { increment: delta } },
    });
  }

  return je;
}
