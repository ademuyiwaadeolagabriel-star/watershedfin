// Accounting domain helpers (server-side only)
import { db } from '@/lib/db';

// Generate journal reference: JE-YYYYMMDD-NNN
export async function generateJournalReference(date?: Date): Promise<string> {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const prefix = `JE-${y}${m}${day}-`;
  const count = await db.journalEntry.count({ where: { reference: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

// Generate invoice number: INV-YYYYMMDD-NNN
export async function generateInvoiceNumber(date?: Date): Promise<string> {
  const d = date || new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const prefix = `INV-${y}${m}${day}-`;
  const count = await db.invoice.count({ where: { invoiceNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

export async function generateBillNumber(): Promise<string> {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const prefix = `BILL-${y}${m}-`;
  const count = await db.vendorBill.count({ where: { billNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(3, '0')}`;
}

export async function generatePayslipNumber(period: string): Promise<string> {
  const prefix = `PS-${period.replace(/-/g, '')}-`;
  const count = await db.payslip.count({ where: { payslipNumber: { startsWith: prefix } } });
  return `${prefix}${String(count + 1).padStart(4, '0')}`;
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

// Post a journal entry and update account balances atomically
export async function postJournal(
  params: {
    date: Date;
    description: string;
    items: { accountId: string; debit: number; credit: number }[];
    createdById?: string;
    sourceType?: string;
    sourceId?: string;
    metadata?: any;
  }
) {
  const totalDebit = params.items.reduce((s, i) => s + Number(i.debit || 0), 0);
  const totalCredit = params.items.reduce((s, i) => s + Number(i.credit || 0), 0);
  if (Math.abs(totalDebit - totalCredit) > 0.01) {
    throw new Error(`Unbalanced entry: debit ${totalDebit} != credit ${totalCredit}`);
  }

  const reference = await generateJournalReference(params.date);
  const entry = await db.journalEntry.create({
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

  // Update account balances
  for (const it of entry.items) {
    const acc = await db.chartOfAccount.findUnique({ where: { id: it.accountId } });
    if (!acc) continue;
    const newBal = applyToBalance(acc.balance, acc.type, it.debit, it.credit);
    await db.chartOfAccount.update({ where: { id: acc.id }, data: { balance: newBal } });
  }

  return entry;
}
