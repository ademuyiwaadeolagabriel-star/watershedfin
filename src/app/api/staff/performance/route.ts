import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/staff/performance?role=loan&branchId=xxx&month=YYYY-MM
 * Returns performance metrics for all LOs or BMs
 * - Average processing time per loan
 * - Approval rate
 * - Average loan amount
 * - CAM quality (queries/returns count)
 * - Total disbursed
 */
export async function GET(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { searchParams } = new URL(req.url);
    const role = searchParams.get('role') || 'loan';
    const branchId = searchParams.get('branchId');
    const month = searchParams.get('month') || new Date().toISOString().slice(0, 7);

    const monthStart = new Date(`${month}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);

    const staff = await db.admin.findMany({
      where: {
        role,
        ...(branchId ? { branchId } : {}),
        status: 1,
      },
      select: {
        id: true, firstName: true, lastName: true, role: true,
        branchId: true,
        branch: { select: { name: true, code: true } },
        monthlyDisbursementTarget: true,
        monthlyLoanCountTarget: true,
      },
    });

    const performance = await Promise.all(staff.map(async (s) => {
      const loans = await db.loanApplicants.findMany({
        where: {
          staffId: s.id,
          OR: [
            { submittedAt: { gte: monthStart, lt: monthEnd } },
            { disbursedAt: { gte: monthStart, lt: monthEnd } },
          ],
        },
        select: {
          id: true, status: true, amount: true, finalAmount: true,
          submittedAt: true, approvedDate: true, disbursedAt: true,
          currentStep: true,
        },
      });

      const approved = loans.filter(l => l.status === 'running' || l.status === 'paid').length;
      const declined = loans.filter(l => l.status === 'declined').length;
      const disbursed = loans.filter(l => l.disbursedAt);
      const totalDisbursed = disbursed.reduce((sum, l) => sum + (l.finalAmount || l.amount), 0);
      const avgAmount = loans.length > 0 ? loans.reduce((s, l) => s + (l.amount || 0), 0) / loans.length : 0;

      // Processing time: submitted to approved
      const processingTimes = loans
        .filter(l => l.submittedAt && l.approvedDate)
        .map(l => (new Date(l.approvedDate!).getTime() - new Date(l.submittedAt!).getTime()) / (1000 * 60 * 60 * 24));
      const avgProcessingDays = processingTimes.length > 0
        ? processingTimes.reduce((a, b) => a + b, 0) / processingTimes.length
        : 0;

      return {
        staffId: s.id,
        name: `${s.firstName} ${s.lastName}`,
        branch: s.branch?.name || '—',
        totalLoans: loans.length,
        approved,
        declined,
        approvalRate: loans.length > 0 ? Math.round((approved / loans.length) * 100) : 0,
        totalDisbursed,
        avgLoanAmount: Math.round(avgAmount),
        avgProcessingDays: Math.round(avgProcessingDays),
        disbursementTarget: s.monthlyDisbursementTarget || 0,
        loanCountTarget: s.monthlyLoanCountTarget || 0,
        targetProgress: s.monthlyDisbursementTarget
          ? Math.round((totalDisbursed / s.monthlyDisbursementTarget) * 100)
          : 0,
      };
    }));

    return NextResponse.json({ staff: performance, month });
  } catch (e: any) {
    console.error('Performance API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
