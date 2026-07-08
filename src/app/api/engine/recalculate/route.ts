import { NextRequest, NextResponse } from 'next/server';
import { executeFullAppraisal, EngineInput } from '@/lib/credit-engine';

export async function POST(req: NextRequest) {
  try {
    const input: EngineInput = await req.json();
    const result = executeFullAppraisal(input);
    return NextResponse.json({ result });
  } catch (e: any) {
    console.error('Engine recalculate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
