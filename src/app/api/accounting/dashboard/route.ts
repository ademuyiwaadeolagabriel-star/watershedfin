import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const accounts = await db.chartOfAccount.findMany({ where: { isActive: true } });

    const totalAssets = accounts.filter((a) => a.type === 'asset').reduce((s, a) => s + a.balance, 0);
    const totalLiabilities = accounts.filter((a) => a.type === 'liability').reduce((s, a) => s + a.balance, 0);
    const totalEquity = accounts.filter((a) => a.type === 'equity').reduce((s, a) => s + a.balance, 0);

    // Period (YTD) revenue/expense from journal items
    const yStart = new Date(new Date().getFullYear(), 0, 1);
    const items = await db.journalItem.findMany({
      where: { journalEntry: { date: { gte: yStart } }, account: { type: { in: ['revenue', 'expense'] } } },
      include: { account: true },
    });
    let totalRevenue = 0;
    let totalExpenses = 0;
    for (const it of items) {
      if (it.account.type === 'revenue') totalRevenue += it.credit - it.debit;
      else totalExpenses += it.debit - it.credit;
    }
    const netIncome = totalRevenue - totalExpenses;

    // AR summary (invoices)
    const invoices = await db.invoice.findMany({ where: { status: { in: ['sent', 'partial', 'overdue'] } } });
    const outstanding = invoices.reduce((s, i) => s + (i.totalAmount - i.totalPaid), 0);
    const overdue = invoices.filter((i) => new Date(i.dueDate) < new Date()).reduce((s, i) => s + (i.totalAmount - i.totalPaid), 0);
    const totalInv = invoices.reduce((s, i) => s + i.totalAmount, 0);
    const collected = invoices.reduce((s, i) => s + i.totalPaid, 0);
    const collectionRate = totalInv > 0 ? (collected / totalInv) * 100 : 0;

    // AP summary (vendor bills)
    const bills = await db.vendorBill.findMany({ where: { status: { in: ['pending', 'partial', 'unpaid'] } } });
    const payable = bills.reduce((s, b) => s + (b.totalAmount - b.totalPaid), 0);
    const payableOverdue = bills.filter((b) => new Date(b.dueDate) < new Date()).reduce((s, b) => s + (b.totalAmount - b.totalPaid), 0);
    const vendorCount = await db.vendor.count({ where: { isActive: true } });

    // Recent journals
    const recentJournals = await db.journalEntry.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      include: { items: true, createdBy: { select: { firstName: true, lastName: true } } },
    });

    // Cash position
    const cashAccounts = accounts.filter((a) => a.subType === 'cash');
    const bankAccounts = accounts.filter((a) => a.subType === 'bank');
    const cashOnHand = cashAccounts.reduce((s, a) => s + a.balance, 0);
    const bankBalance = bankAccounts.reduce((s, a) => s + a.balance, 0);
    const tillsBalance = (await db.till.aggregate({ _sum: { currentBalance: true } }))._sum.currentBalance || 0;

    return NextResponse.json({
      totalAssets,
      totalLiabilities,
      totalEquity,
      totalRevenue,
      totalExpenses,
      netIncome,
      arSummary: { outstanding, overdue, collectionRate, invoiceCount: invoices.length },
      apSummary: { payable, overdue: payableOverdue, vendorCount },
      recentJournals: recentJournals.map((j) => ({
        id: j.id,
        reference: j.reference,
        date: j.date,
        description: j.description,
        isReversed: j.isReversed,
        totalDebit: j.items.reduce((s, i) => s + i.debit, 0),
        createdBy: j.createdBy ? `${j.createdBy.firstName} ${j.createdBy.lastName}` : null,
      })),
      cashPosition: { cashOnHand, bankBalance, tillsBalance, total: cashOnHand + bankBalance + tillsBalance },
    });
  } catch (e: any) {
    console.error('Accounting dashboard GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
