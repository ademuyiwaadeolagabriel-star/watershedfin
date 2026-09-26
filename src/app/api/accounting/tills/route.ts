import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const tills = await db.till.findMany({
      orderBy: { createdAt: 'desc' },
      include: {
        glAccount: true,
        branch: true,
        _count: { select: { transactions: true } },
      },
    });
    return NextResponse.json({ tills });
  } catch (e: any) {
    console.error('Tills GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'cfo', 'hoc', 'cro', 'finance', 'accountant', 'teller']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const body = await req.json();
    const { name, code, location, glAccountId, branchId, balanceLimit, openingBalance, assignedUserId, createdById } = body;

    if (!name || !code || !glAccountId) {
      return NextResponse.json({ error: 'name, code, glAccountId required' }, { status: 400 });
    }
    const dup = await db.till.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ error: 'Till code already exists' }, { status: 400 });

    const opening = Number(openingBalance) || 0;
    const till = await db.till.create({
      data: {
        name,
        code,
        location: location || null,
        glAccountId,
        branchId: branchId || null,
        currentBalance: opening,
        openingBalance: opening,
        balanceLimit: balanceLimit ? Number(balanceLimit) : null,
        assignedUserId: assignedUserId || null,
        status: 'active',
        lastActivity: new Date(),
        createdById: createdById || null,
      },
      include: { glAccount: true },
    });
    return NextResponse.json({ till }, { status: 201 });
  } catch (e: any) {
    console.error('Till POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
