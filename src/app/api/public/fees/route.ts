import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/public/fees
 * Public endpoint — returns active fees for display in self-onboarding
 */
export async function GET() {
  const fees = await db.systemSetting.findMany({
    where: { category: 'fees', active: true },
    select: { key: true, value: true, label: true },
  });

  return NextResponse.json({
    fees: fees.map(f => ({
      key: f.key,
      label: f.label || f.key,
      amount: Number(f.value) || 0,
    })),
  });
}
