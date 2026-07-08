import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');

    const dateRange: any = {};
    if (from) dateRange.gte = new Date(from);
    if (to) {
      const t = new Date(to);
      t.setHours(23, 59, 59, 999);
      dateRange.lte = t;
    }

    // Treasury income: from investments matured/active in range + bank assets
    const invWhere: any = {};
    if (from || to) invWhere.createdAt = dateRange;
    const investments = await db.treasuryInvestment.findMany({
      where: invWhere,
      select: { accruedInterest: true, principal: true, createdAt: true },
    });
    let totalTreasuryIncome = investments.reduce((s, i) => s + i.accruedInterest, 0);

    // Add bank asset accrued income
    const assetWhere: any = {};
    if (from || to) assetWhere.purchaseDate = dateRange;
    const assets = await db.treasuryBankAsset.findMany({
      where: assetWhere,
      select: { accruedIncome: true },
    });
    totalTreasuryIncome += assets.reduce((s, a) => s + a.accruedIncome, 0);

    // Try to derive loan income and interest expense from journal entries
    let totalLoanIncome = 0;
    let totalInterestExpense = 0;

    if (from || to) {
      const journalItems = await db.journalItem.findMany({
        where: {
          journalEntry: { date: dateRange },
          account: { type: { in: ['revenue', 'expense'] } },
        },
        include: { account: true },
      });
      for (const it of journalItems) {
        const name = (it.account.name || '').toLowerCase();
        const sub = (it.account.subType || '').toLowerCase();
        if (it.account.type === 'revenue') {
          const isLoan = name.includes('loan') || sub.includes('loan_interest');
          if (isLoan) totalLoanIncome += it.credit - it.debit;
        } else if (it.account.type === 'expense') {
          const isInterest = name.includes('interest') || sub.includes('interest_expense');
          if (isInterest) totalInterestExpense += it.debit - it.credit;
        }
      }
    }

    const totalIncome = totalTreasuryIncome + totalLoanIncome;
    const nim = totalIncome > 0 ? ((totalIncome - totalInterestExpense) / totalIncome) * 100 : 0;

    return NextResponse.json({
      totalTreasuryIncome,
      totalLoanIncome,
      totalInterestExpense,
      nim,
      from,
      to,
    });
  } catch (e: any) {
    console.error('Treasury reports GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
