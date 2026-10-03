import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { refreshAccrual } from '@/lib/treasury';
import { requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // v51 — auth gate.
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  try {
    const investments = await db.treasuryInvestment.findMany({
      where: { status: { in: ['active', 'matured'] } },
    });

    // Refresh accruals
    for (const inv of investments) {
      await refreshAccrual(inv.id);
    }

    const active = investments.filter((i) => i.status === 'active');
    const matured = investments.filter((i) => i.status === 'matured');

    // v51 — Decimal arithmetic: principal is Decimal, accruedInterest is
    // Decimal | null. Wrap both with Number() before arithmetic.
    const totalInvested = active.reduce((s, i) => s + Number(i.principal), 0);
    const totalEarned = investments.reduce((s, i) => s + Number(i.accruedInterest || 0), 0);
    const projectedValue = active.reduce((s, i) => s + Number(i.principal) + Number(i.accruedInterest || 0), 0);

    // Bank assets
    const assets = await db.treasuryBankAsset.findMany({ where: { status: 'active' } });
    const totalAssetsValue = assets.reduce((s, a) => s + Number(a.purchasePrice ?? 0) + Number(a.accruedIncome ?? 0), 0);

    return NextResponse.json({
      totalInvested,
      totalEarned,
      projectedValue,
      activeCount: active.length,
      maturedCount: matured.length,
      totalAssetsValue,
      assetCount: assets.length,
    });
  } catch (e: any) {
    console.error('Treasury dashboard GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
