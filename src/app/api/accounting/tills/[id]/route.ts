import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.till.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Till not found' }, { status: 404 });

    const till = await db.till.update({
      where: { id },
      data: {
        name: body.name ?? existing.name,
        location: body.location !== undefined ? body.location : existing.location,
        glAccountId: body.glAccountId ?? existing.glAccountId,
        branchId: body.branchId !== undefined ? body.branchId || null : existing.branchId,
        balanceLimit: body.balanceLimit !== undefined ? (body.balanceLimit ? Number(body.balanceLimit) : null) : existing.balanceLimit,
        assignedUserId: body.assignedUserId !== undefined ? body.assignedUserId || null : existing.assignedUserId,
        status: body.status ?? existing.status,
        currentBalance: body.currentBalance !== undefined ? Number(body.currentBalance) : existing.currentBalance,
      },
      include: { glAccount: true },
    });
    return NextResponse.json({ till });
  } catch (e: any) {
    console.error('Till PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
