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

    const where: any = {};
    if (loanId) where.loanApplicantId = loanId;

    const checklists = await db.preDisbursementChecklist.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: 100,
      include: {
        loan: {
          select: {
            id: true,
            applicationRef: true,
            amount: true,
            currentStep: true,
            complianceStatus: true,
            user: { select: { id: true, firstName: true, lastName: true, business: { select: { name: true } } } },
          },
        },
      },
    });

    return NextResponse.json({ checklists });
  } catch (e: any) {
    console.error('List checklist API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
