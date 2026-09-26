import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

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
    // v51 — Decimal arithmetic: accruedInterest is Decimal | null.
    let totalTreasuryIncome = investments.reduce((s, i) => s + Number(i.accruedInterest || 0), 0);

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
          // v51 — Decimal arithmetic: it.credit/it.debit are Decimal.
          if (isLoan) totalLoanIncome += Number(it.credit) - Number(it.debit);
        } else if (it.account.type === 'expense') {
          const isInterest = name.includes('interest') || sub.includes('interest_expense');
          // v51 — Decimal arithmetic.
          if (isInterest) totalInterestExpense += Number(it.debit) - Number(it.credit);
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
