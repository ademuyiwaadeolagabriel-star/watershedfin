import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isDebitNormal } from '@/lib/accounting';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type') || 'balance_sheet';
    const asOf = url.searchParams.get('asOf');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const asOfDate = asOf ? new Date(asOf) : new Date();

    if (type === 'balance_sheet') {
      const accounts = await db.chartOfAccount.findMany({
        where: { type: { in: ['asset', 'liability', 'equity'] }, isActive: true },
        orderBy: [{ type: 'asc' }, { code: 'asc' }],
      });
      const groups: Record<string, any[]> = { asset: [], liability: [], equity: [] };
      for (const a of accounts) groups[a.type]?.push(a);
      const sum = (arr: any[]) => arr.reduce((s, a) => s + a.balance, 0);
      const totalAssets = sum(groups.asset);
      const totalLiabilities = sum(groups.liability);
      const totalEquity = sum(groups.equity);
      return NextResponse.json({
        type,
        asOf: asOfDate,
        groups,
        totalAssets,
        totalLiabilities,
        totalEquity,
        balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 1,
      });
    }

    if (type === 'profit_loss') {
      const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
      const end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);
      const items = await db.journalItem.findMany({
        where: {
          journalEntry: { date: { gte: start, lte: end } },
          account: { type: { in: ['revenue', 'expense'] } },
        },
        include: { account: true },
      });
      const revenueMap = new Map<string, { name: string; code: string; amount: number }>();
      const expenseMap = new Map<string, { name: string; code: string; amount: number }>();
      for (const it of items) {
        const m = it.account.type === 'revenue' ? revenueMap : expenseMap;
        const key = it.accountId;
        const cur = m.get(key) || { name: it.account.name, code: it.account.code, amount: 0 };
        if (it.account.type === 'revenue') cur.amount += it.credit - it.debit;
        else cur.amount += it.debit - it.credit;
        m.set(key, cur);
      }
      const revenue = Array.from(revenueMap.values());
      const expenses = Array.from(expenseMap.values());
      const totalRevenue = revenue.reduce((s, r) => s + r.amount, 0);
      const totalExpenses = expenses.reduce((s, e) => s + e.amount, 0);
      return NextResponse.json({
        type,
        from: start,
        to: end,
        revenue,
        expenses,
        totalRevenue,
        totalExpenses,
        netIncome: totalRevenue - totalExpenses,
      });
    }

    if (type === 'trial_balance') {
      const accounts = await db.chartOfAccount.findMany({
        where: { isActive: true },
        orderBy: [{ code: 'asc' }],
      });
      const rows = accounts.map((a) => {
        const bal = a.balance;
        const debit = isDebitNormal(a.type) && bal > 0 ? bal : !isDebitNormal(a.type) && bal < 0 ? -bal : 0;
        const credit = !isDebitNormal(a.type) && bal > 0 ? bal : isDebitNormal(a.type) && bal < 0 ? -bal : 0;
        return { id: a.id, code: a.code, name: a.name, type: a.type, debit, credit };
      });
      const totalDebit = rows.reduce((s, r) => s + r.debit, 0);
      const totalCredit = rows.reduce((s, r) => s + r.credit, 0);
      return NextResponse.json({ type, asOf: asOfDate, rows, totalDebit, totalCredit, balanced: Math.abs(totalDebit - totalCredit) < 1 });
    }

    if (type === 'cash_flow') {
      const start = from ? new Date(from) : new Date(new Date().getFullYear(), 0, 1);
      const end = to ? new Date(to) : new Date();
      end.setHours(23, 59, 59, 999);
      const cashAccounts = await db.chartOfAccount.findMany({
        where: { OR: [{ subType: 'cash' }, { subType: 'bank' }], isActive: true },
      });
      const items = await db.journalItem.findMany({
        where: {
          journalEntry: { date: { gte: start, lte: end } },
          account: { OR: [{ subType: 'cash' }, { subType: 'bank' }] },
        },
        include: { account: true },
      });
      const byAccount = new Map<string, { code: string; name: string; inflow: number; outflow: number; net: number; opening: number; closing: number }>();
      for (const a of cashAccounts) {
        byAccount.set(a.id, { code: a.code, name: a.name, inflow: 0, outflow: 0, net: 0, opening: 0, closing: a.balance });
      }
      for (const it of items) {
        const row = byAccount.get(it.accountId);
        if (!row) continue;
        row.inflow += it.credit;
        row.outflow += it.debit;
        row.net += it.credit - it.debit;
      }
      // opening = closing - net
      for (const row of byAccount.values()) row.opening = row.closing - row.net;
      const rows = Array.from(byAccount.values());
      const totalInflow = rows.reduce((s, r) => s + r.inflow, 0);
      const totalOutflow = rows.reduce((s, r) => s + r.outflow, 0);
      const netCash = totalInflow - totalOutflow;
      return NextResponse.json({ type, from: start, to: end, rows, totalInflow, totalOutflow, netCash });
    }

    return NextResponse.json({ error: 'Unknown statement type' }, { status: 400 });
  } catch (e: any) {
    console.error('Statements GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
