import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { computeMaturity } from '@/lib/treasury';

export async function GET() {
  try {
    const assets = await db.treasuryBankAsset.findMany({
      orderBy: { purchaseDate: 'desc' },
    });
    return NextResponse.json({ assets });
  } catch (e: any) {
    console.error('Treasury assets GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const body = await req.json();
    const { assetName, assetClass, faceValue, purchasePrice, tenorDays, yieldRate, custodian, purchaseDate } = body;

    if (!assetName || !assetClass || !faceValue || !purchasePrice) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const fv = Number(faceValue);
    const pp = Number(purchasePrice);
    // Auto-calc yield if not provided: (faceValue - purchasePrice) / purchasePrice * (365/tenor) * 100
    let yr = body.yieldRate ? Number(body.yieldRate) : 0;
    const tenor = Number(tenorDays) || 0;
    if ((!yr || yr === 0) && tenor > 0 && pp > 0) {
      yr = ((fv - pp) / pp) * (365 / tenor) * 100;
    }

    const pDate = purchaseDate ? new Date(purchaseDate) : new Date();
    const mDate = tenor > 0 ? computeMaturity(pDate, tenor) : null;

    const asset = await db.treasuryBankAsset.create({
      data: {
        assetName,
        assetClass,
        faceValue: fv,
        purchasePrice: pp,
        yieldRate: yr,
        accruedIncome: 0,
        purchaseDate: pDate,
        maturityDate: mDate,
        custodian: custodian || null,
        status: 'active',
      },
    });
    return NextResponse.json({ asset }, { status: 201 });
  } catch (e: any) {
    console.error('Treasury asset POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
