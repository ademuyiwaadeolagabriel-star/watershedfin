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
    const existing = await db.treasuryProduct.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Product not found' }, { status: 404 });

    const product = await db.treasuryProduct.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        description: body.description ?? existing.description,
        minAmount: body.minAmount !== undefined ? Number(body.minAmount) : existing.minAmount,
        maxAmount: body.maxAmount !== undefined ? (body.maxAmount ? Number(body.maxAmount) : null) : existing.maxAmount,
        interestRatePa: body.interestRatePa !== undefined ? Number(body.interestRatePa) : existing.interestRatePa,
        minTenorDays: body.minTenorDays !== undefined ? Number(body.minTenorDays) : existing.minTenorDays,
        maxTenorDays: body.maxTenorDays !== undefined ? Number(body.maxTenorDays) : existing.maxTenorDays,
        whtRate: body.whtRate !== undefined ? Number(body.whtRate) : existing.whtRate,
        earlyLiquidationPenalty:
          body.earlyLiquidationPenalty !== undefined ? Number(body.earlyLiquidationPenalty) : existing.earlyLiquidationPenalty,
        isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
      },
    });
    return NextResponse.json({ product });
  } catch (e: any) {
    console.error('Treasury product PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req : NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'treasury']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const { id } = await params;
    const count = await db.treasuryInvestment.count({ where: { productId: id } });
    if (count > 0) {
      return NextResponse.json(
        { error: 'Cannot delete product with existing investments' },
        { status: 400 }
      );
    }
    await db.treasuryProduct.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Treasury product DELETE error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
