import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const products = await db.treasuryProduct.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ products });
  } catch (e: any) {
    console.error('Treasury products GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const body = await req.json();
    const product = await db.treasuryProduct.create({
      data: {
        name: body.name,
        description: body.description || null,
        minAmount: Number(body.minAmount) || 0,
        maxAmount: body.maxAmount ? Number(body.maxAmount) : null,
        interestRatePa: Number(body.interestRatePa) || 0,
        minTenorDays: Number(body.minTenorDays) || 30,
        maxTenorDays: Number(body.maxTenorDays) || 365,
        whtRate: Number(body.whtRate) ?? 10,
        earlyLiquidationPenalty: Number(body.earlyLiquidationPenalty) ?? 20,
        isActive: body.isActive !== false,
      },
    });
    return NextResponse.json({ product }, { status: 201 });
  } catch (e: any) {
    console.error('Treasury products POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
