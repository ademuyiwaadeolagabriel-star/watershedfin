import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    for (const k of ['name', 'slug', 'description', 'type', 'productType', 'createdBy']) {
      if (k in body) data[k] = body[k];
    }
    for (const k of ['duration', 'interest', 'failedInterest', 'installment', 'min', 'max', 'minCreditScore', 'maxDebtServiceRatio', 'status']) {
      if (k in body) data[k] = Number(body[k]);
    }
    const product = await db.loanPlan.update({ where: { id }, data });
    return NextResponse.json({ product });
  } catch (e: any) {
    console.error('Update loan product API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req : NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

  try {
    const { id } = await params;
    await db.loanPlan.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete loan product API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
