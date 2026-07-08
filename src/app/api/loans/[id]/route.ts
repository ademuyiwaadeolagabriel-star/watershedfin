import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const loan = await db.loanApplicants.findUnique({
      where: { id },
      include: {
        user: { include: { business: true } },
        plan: true,
        branch: true,
        loanOfficer: true,
        appraisal: true,
        mccDecisions: { orderBy: { approvalLevel: 'asc' }, include: { approver: true } },
        approvalLogs: { orderBy: { createdAt: 'desc' }, take: 30, include: { admin: true } },
        complianceConditions: true,
        preDisbursementChecklist: true,
      },
    });

    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }

    // Strip password
    const safe: any = {
      ...loan,
      user: loan.user ? { ...loan.user, password: undefined } : null,
      loanOfficer: loan.loanOfficer ? { ...loan.loanOfficer, password: undefined } : null,
      mccDecisions: loan.mccDecisions.map((d: any) => ({
        ...d,
        approver: d.approver ? { ...d.approver, password: undefined } : null,
      })),
      approvalLogs: loan.approvalLogs.map((l: any) => ({
        ...l,
        admin: l.admin ? { ...l.admin, password: undefined } : null,
      })),
    };

    return NextResponse.json({ loan: safe });
  } catch (e: any) {
    console.error('Loan detail API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
