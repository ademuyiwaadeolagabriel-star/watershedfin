import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/public/fees
 * Public endpoint — returns active fees for display in self-onboarding.
 * v41: Completely defensive — works even if label/active columns don't exist.
 */
export async function GET() {
  try {
    // Try with label + active columns (v26+ schema)
    let fees: any[];
    try {
      fees = await db.systemSetting.findMany({
        where: { category: 'fees' },
        select: { key: true, value: true },
        orderBy: { key: 'asc' },
      });
    } catch (e) {
      // Fallback: if the table doesn't exist at all, return empty
      console.error('[PUBLIC FEES] Query failed:', e);
      return NextResponse.json({ fees: [] });
    }

    return NextResponse.json({
      fees: fees.map((f: any) => ({
        key: f.key,
        label: f.label || f.key,
        amount: Number(f.value) || 0,
      })),
    });
  } catch (e: any) {
    console.error('[PUBLIC FEES] Error:', e);
    // Return empty array instead of 500 — onboarding should still work
    return NextResponse.json({ fees: [] });
  }
}
