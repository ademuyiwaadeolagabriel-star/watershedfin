import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const plans = await db.loanPlan.findMany({
      where: { status: 1 },
      orderBy: { name: 'asc' },
    });
    return NextResponse.json({ plans });
  } catch (e: any) {
    console.error('Loan plans API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
