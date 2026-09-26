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

    // v54 (audit #7): fail-closed on rate / ccd / upfront — never silently
    // default to 24% / 10% / 1%. These defaults would fabricate a financial
    // schedule that does not reflect any actual loan terms.
    const numRate = Number(rate);
    if (isNaN(numRate) || numRate < 0) {
      return NextResponse.json({ error: 'rate is required for loan calculation' }, { status: 400 });
    }
    const numCcd = Number(ccd);
    if (isNaN(numCcd) || numCcd < 0) {
      return NextResponse.json({ error: 'ccd fee percent is required for loan calculation' }, { status: 400 });
    }
    const numUpfront = Number(upfront);
    if (isNaN(numUpfront) || numUpfront < 0) {
      return NextResponse.json({ error: 'upfront fee percent is required for loan calculation' }, { status: 400 });
    }

    const calculation = calculateLoanSchedule(
      Number(amount),
      numRate,
      Number(tenor),
      (method as 'REDUCING' | 'FLAT') || 'REDUCING',
      new Date(),
      numCcd,
      numUpfront,
      0,
    );

    return NextResponse.json({ calculation });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
