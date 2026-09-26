import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { executeFullAppraisal, EngineInput } from '@/lib/credit-engine';

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const input: EngineInput = await req.json();
    const result = executeFullAppraisal(input);
    return NextResponse.json({ result });
  } catch (e: any) {
    console.error('Engine recalculate error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
