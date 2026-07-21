import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/branches/[id]/target
 * Returns the branch's monthly target + aggregate performance of all its LOs
 *
 * POST /api/branches/[id]/target
 * Sets the branch's monthly target.
 * - Super admin, MD, HOC can set branch targets
 * - BM can set target for their OWN branch (self-assign)
 * Body: { disbursementTarget, loanCountTarget, month? }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { id: branchId } = await params;
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      select: {
        id: true, name: true, code: true, managerId: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
        targetMonth: true, targetSetAt: true, targetSetBy: true,
      },
    });

    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });

    // Calculate aggregate performance of all LOs in this branch for the target month
    const currentMonth = branch.targetMonth || new Date().toISOString().slice(0, 7);
    const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Get all loan officers in this branch
    const loanOfficers = await db.admin.findMany({
      where: { branchId, role: 'loan', status: 1 },
      select: {
        id: true, firstName: true, lastName: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
      },
    });

    // Aggregate disbursement across all LOs in this branch
    const loIds = loanOfficers.map(lo => lo.id);
    const disbursedLoans = loIds.length > 0 ? await db.loanApplicants.findMany({
      where: {
        staffId: { in: loIds },
        disbursedAt: { gte: monthStart, lt: monthEnd },
      },
      select: { id: true, amount: true, finalAmount: true, staffId: true },
    }) : [];

    const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + (l.finalAmount || l.amount), 0);
    const loanCount = disbursedLoans.length;

    // Also count loans submitted (not necessarily disbursed)
    const submittedLoans = loIds.length > 0 ? await db.loanApplicants.count({
      where: {
        staffId: { in: loIds },
        submittedAt: { gte: monthStart, lt: monthEnd },
      },
    }) : 0;

    // Per-LO breakdown
    const loBreakdown = await Promise.all(loanOfficers.map(async (lo) => {
      const loLoans = disbursedLoans.filter(l => l.staffId === lo.id);
      const loDisbursed = loLoans.reduce((sum, l) => sum + (l.finalAmount || l.amount), 0);
      return {
        staffId: lo.id,
        name: `${lo.firstName} ${lo.lastName}`,
        disbursementTarget: lo.monthlyDisbursementTarget || 0,
        loanCountTarget: lo.monthlyLoanCountTarget || 0,
        actualDisbursed: loDisbursed,
        actualLoans: loLoans.length,
        progress: lo.monthlyDisbursementTarget
          ? Math.round((loDisbursed / lo.monthlyDisbursementTarget) * 100)
          : 0,
      };
    }));

    return NextResponse.json({
      branch,
      target: {
        disbursementTarget: branch.monthlyDisbursementTarget || 0,
        loanCountTarget: branch.monthlyLoanCountTarget || 0,
        month: currentMonth,
      },
      actual: {
        totalDisbursed,
        loanCount,
        submittedLoans,
      },
      progress: {
        disbursementPct: branch.monthlyDisbursementTarget
          ? Math.round((totalDisbursed / branch.monthlyDisbursementTarget) * 100)
          : 0,
        loanCountPct: branch.monthlyLoanCountTarget
          ? Math.round((loanCount / branch.monthlyLoanCountTarget) * 100)
          : 0,
      },
      loBreakdown,
    });
  } catch (e: any) {
    console.error('Branch target GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    // Super admin, MD, HOC can set any branch's target
    // BM can set target for their OWN branch only
    const { id: branchId } = await params;
    const branch = await db.branch.findUnique({
      where: { id: branchId },
      select: { id: true, managerId: true, name: true },
    });

    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });

    const canSetTarget =
      authPayload.role === 'super' ||
      authPayload.role === 'md' ||
      authPayload.role === 'hoc' ||
      (authPayload.role === 'bm' && branch.managerId === authPayload.id);

    if (!canSetTarget) {
      return NextResponse.json(
        { error: 'Only Super Admin, MD, HOC, or the Branch Manager can set this branch target' },
        { status: 403 }
      );
    }

    const body = await req.json();
    const { disbursementTarget, loanCountTarget, month } = body;

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    const updated = await db.branch.update({
      where: { id: branchId },
      data: {
        monthlyDisbursementTarget: Number(disbursementTarget) || 0,
        monthlyLoanCountTarget: Number(loanCountTarget) || 0,
        targetMonth,
        targetSetAt: new Date(),
        targetSetBy: authPayload.id,
      },
      select: {
        id: true, name: true, code: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
        targetMonth: true, targetSetAt: true,
      },
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          adminId: authPayload.id,
          action: 'branch_target_set',
          description: `Set branch target for ${updated.name}: ₦${disbursementTarget} / ${loanCountTarget} loans (${targetMonth})`,
          module: 'targets',
          severity: 'info',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });
    } catch (e) {
      // non-blocking
    }

    return NextResponse.json({ success: true, branch: updated });
  } catch (e: any) {
    console.error('Branch target POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
