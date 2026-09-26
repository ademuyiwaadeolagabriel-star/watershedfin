import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const { id } = await params;
    const body = await req.json();
    const data: any = {};
    for (const k of ['name', 'code', 'state', 'address', 'phoneContact', 'managerId', 'status']) {
      if (k in body) data[k] = body[k];
    }
    const branch = await db.branch.update({ where: { id }, data });
    return NextResponse.json({ branch });
  } catch (e: any) {
    console.error('Update branch API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(req : NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const { id } = await params;
    await db.branch.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete branch API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
