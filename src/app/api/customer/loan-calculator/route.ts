import { NextRequest, NextResponse } from 'next/server';
import { calculateLoanSchedule } from '@/lib/loan-calc';

// POST /api/customer/loan-calculator
// Body: { amount, rate, tenor, method, ccd, upfront }
// Returns calculated schedule + cost breakdown (no DB writes)
export async function POST(req: NextRequest) {
  try {
    const { amount, rate, tenor, method, ccd, upfront } = await req.json();

    if (!amount || !tenor) {
      return NextResponse.json({ error: 'amount and tenor required' }, { status: 400 });
    }

    const calculation = calculateLoanSchedule(
      Number(amount),
      Number(rate) || 24,
      Number(tenor),
      (method as 'REDUCING' | 'FLAT') || 'REDUCING',
      new Date(),
      Number(ccd) || 10,
      Number(upfront) || 1,
      0,
    );

    return NextResponse.json({ calculation });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
