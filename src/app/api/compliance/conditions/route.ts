import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  // v51 — auth gate: route-level role check (maker/checker enforced via requireMakerChecker where applicable).
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'compliance']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;

  try {
    const url = new URL(req.url);
    const loanId = url.searchParams.get('loanId');
    const status = url.searchParams.get('status');
    const priority = url.searchParams.get('priority');
    const overdue = url.searchParams.get('overdue');
    const search = url.searchParams.get('search');

    const where: any = {};
    if (loanId) where.loanApplicantId = loanId;
    if (status && status !== 'all') where.status = status;
    if (priority && priority !== 'all') where.priority = priority;
    if (overdue === 'true') {
      where.deadline = { lt: new Date() };
      where.status = { notIn: ['verified', 'rejected', 'waived', 'expired'] };
    }
    if (search) {
      where.OR = [
        { title: { contains: search } },
        { description: { contains: search } },
        { conditionType: { contains: search } },
      ];
    }

    const conditions = await db.complianceCondition.findMany({
      where,
      orderBy: [{ deadline: 'asc' }, { createdAt: 'desc' }],
      take: 200,
      include: {
        loan: {
          select: {
            id: true,
            applicationRef: true,
            amount: true,
            user: { select: { id: true, firstName: true, lastName: true, business: { select: { name: true } } } },
          },
        },
        setByAdmin: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
        verifiedAdmin: { select: { id: true, firstName: true, lastName: true, username: true } },
        _count: { select: { documents: true, verifications: true } },
      },
    });

    return NextResponse.json({ conditions });
  } catch (e: any) {
    console.error('List conditions API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
