import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/public/fees
 * Public endpoint — returns active fees for display in self-onboarding
 * Wrapped in try/catch to prevent 500s from leaking DB connection errors.
 */
export async function GET() {
  try {
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
  } catch (e: any) {
    console.error('[PUBLIC FEES] Error:', e);
    // Return empty fees instead of 500 so the onboarding form doesn't break
    return NextResponse.json({
      fees: [],
      error: 'Failed to load fees',
    });
  }
}
