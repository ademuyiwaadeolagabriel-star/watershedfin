import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.treasuryBankAsset.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const asset = await db.treasuryBankAsset.update({
      where: { id },
      data: {
        assetName: body.assetName ?? existing.assetName,
        assetClass: body.assetClass ?? existing.assetClass,
        faceValue: body.faceValue !== undefined ? Number(body.faceValue) : existing.faceValue,
        purchasePrice: body.purchasePrice !== undefined ? Number(body.purchasePrice) : existing.purchasePrice,
        yieldRate: body.yieldRate !== undefined ? Number(body.yieldRate) : existing.yieldRate,
        accruedIncome: body.accruedIncome !== undefined ? Number(body.accruedIncome) : existing.accruedIncome,
        custodian: body.custodian ?? existing.custodian,
        status: body.status ?? existing.status,
        maturityDate: body.maturityDate ? new Date(body.maturityDate) : existing.maturityDate,
      },
    });
    return NextResponse.json({ asset });
  } catch (e: any) {
    console.error('Treasury asset PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
