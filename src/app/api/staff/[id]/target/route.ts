import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/staff/[id]/target
 * Returns the staff member's monthly target + actual performance
 *
 * POST /api/staff/[id]/target
 * Sets monthly target (only HOC, MD, or Super can set)
 * Body: { disbursementTarget, loanCountTarget, month? }
 */
export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { id: staffId } = await params;
    const staff = await db.admin.findUnique({
      where: { id: staffId },
      select: {
        id: true, firstName: true, lastName: true, role: true, branchId: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
        targetMonth: true, targetSetAt: true, targetSetBy: true,
      },
    });

    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

    // Calculate actual performance for the target month
    const currentMonth = staff.targetMonth || new Date().toISOString().slice(0, 7);
    const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    // Get loans where this staff is the LO and were disbursed in the target month
    const disbursedLoans = await db.loanApplicants.findMany({
      where: {
        staffId,
        disbursedAt: { gte: monthStart, lt: monthEnd },
      },
      select: { id: true, amount: true, finalAmount: true, status: true },
    });

    const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + (l.finalAmount || l.amount), 0);
    const loanCount = disbursedLoans.length;

    // Get loans submitted (not necessarily disbursed) in the target month
    const submittedLoans = await db.loanApplicants.count({
      where: {
        staffId,
        submittedAt: { gte: monthStart, lt: monthEnd },
      },
    });

    return NextResponse.json({
      staff,
      target: {
        disbursementTarget: staff.monthlyDisbursementTarget || 0,
        loanCountTarget: staff.monthlyLoanCountTarget || 0,
        month: currentMonth,
      },
      actual: {
        totalDisbursed,
        loanCount,
        submittedLoans,
      },
      progress: {
        disbursementPct: staff.monthlyDisbursementTarget
          ? Math.round((totalDisbursed / staff.monthlyDisbursementTarget) * 100)
          : 0,
        loanCountPct: staff.monthlyLoanCountTarget
          ? Math.round((loanCount / staff.monthlyLoanCountTarget) * 100)
          : 0,
      },
    });
  } catch (e: any) {
    console.error('Target GET error:', e);
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

    const { id: staffId } = await params;

    // v29 — BM can set target for themselves AND for LOs in their branch
    // Super, MD, HOC can set for anyone
    if (authPayload.role === 'bm') {
      // BM setting their own target → OK
      if (staffId !== authPayload.id) {
        // BM setting target for someone else — must be an LO in their branch
        const targetStaff = await db.admin.findUnique({
          where: { id: staffId },
          select: { id: true, role: true, branchId: true },
        });
        if (!targetStaff) {
          return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
        }
        if (targetStaff.role !== 'loan') {
          return NextResponse.json({ error: 'BM can only set targets for Loan Officers in their branch' }, { status: 403 });
        }
        // Check the LO is in the BM's branch (or the BM has no branch — super edge case)
        const bm = await db.admin.findUnique({
          where: { id: authPayload.id },
          select: { branchId: true },
        });
        if (bm?.branchId && targetStaff.branchId !== bm.branchId) {
          return NextResponse.json({ error: 'BM can only set targets for LOs in their own branch' }, { status: 403 });
        }
      }
    } else {
      // Super, MD, HOC can set for anyone
      const allowedRoles = ['super', 'md', 'hoc'];
      if (!allowedRoles.includes(authPayload.role)) {
        return NextResponse.json({ error: 'Only HOC, MD, Super Admin, or BM (for own branch LOs) can set targets' }, { status: 403 });
      }
    }
    const body = await req.json();
    const { disbursementTarget, loanCountTarget, month } = body;

    const targetMonth = month || new Date().toISOString().slice(0, 7);

    const updated = await db.admin.update({
      where: { id: staffId },
      data: {
        monthlyDisbursementTarget: Number(disbursementTarget) || 0,
        monthlyLoanCountTarget: Number(loanCountTarget) || 0,
        targetMonth,
        targetSetAt: new Date(),
        targetSetBy: authPayload.id,
      },
      select: {
        id: true, firstName: true, lastName: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
        targetMonth: true, targetSetAt: true,
      },
    });

    return NextResponse.json({ success: true, target: updated });
  } catch (e: any) {
    console.error('Target POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
