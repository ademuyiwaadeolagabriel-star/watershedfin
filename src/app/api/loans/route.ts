import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const step = url.searchParams.get('step');
    const staffId = url.searchParams.get('staffId');
    const branchId = url.searchParams.get('branchId');
    const role = url.searchParams.get('role');
    const take = parseInt(url.searchParams.get('take') || '100');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (step && step !== 'all') where.currentStep = step;
    if (staffId) where.staffId = staffId;
    if (branchId) where.branchId = branchId;

    // Role-based filtering
    if (role && role !== 'super') {
      const isCentral = ['md', 'cfo', 'hoc', 'cro', 'legal', 'admin', 'treasury'].includes(role);
      const isAnalyst = ['analyst', 'credit_analyst'].includes(role);
      const isLoanOfficer = role === 'loan';
      const isBM = role === 'bm';

      if (isLoanOfficer && staffId) {
        where.staffId = staffId;
      } else if (isBM && branchId) {
        where.branchId = branchId;
      } else if (isAnalyst && !step) {
        where.currentStep = 'ANALYST_STRUCTURING';
      } else if (!isCentral && branchId) {
        where.branchId = branchId;
      }
    }

    const loans = await db.loanApplicants.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take,
      include: {
        user: { include: { business: true } },
        plan: true,
        branch: true,
        loanOfficer: true,
      },
    });

    const safe = loans.map((l: any) => ({
      ...l,
      user: l.user ? { ...l.user, password: undefined } : null,
    }));

    return NextResponse.json({ loans: safe });
  } catch (e: any) {
    console.error('Loans API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
