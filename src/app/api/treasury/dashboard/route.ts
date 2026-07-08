import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { refreshAccrual } from '@/lib/treasury';

export async function GET() {
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

    const totalInvested = active.reduce((s, i) => s + i.principal, 0);
    const totalEarned = investments.reduce((s, i) => s + i.accruedInterest, 0);
    const projectedValue = active.reduce((s, i) => s + i.principal + i.accruedInterest, 0);

    // Bank assets
    const assets = await db.treasuryBankAsset.findMany({ where: { status: 'active' } });
    const totalAssetsValue = assets.reduce((s, a) => s + a.purchasePrice + a.accruedIncome, 0);

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
