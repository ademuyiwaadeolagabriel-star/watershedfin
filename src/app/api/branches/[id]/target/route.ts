import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// ============================================================================
// GET /api/branches/[id]/target
// POST /api/branches/[id]/target
//
// v41: Now supports three target period types:
//   - monthly   (periodKey: "2024-01")
//   - quarterly (periodKey: "2024-Q1")
//   - annual    (periodKey: "2024")
//
// The GET endpoint returns ALL three periods' targets + actuals so the UI
// can display them side-by-side. The POST endpoint accepts a `periodType`
// field to determine which target to update.
//
// Permissions:
//   - Super admin, MD, HOC can set any branch's target
//   - BM can set target for their OWN branch only
// ============================================================================

function getQuarterRange(quarterKey: string): { start: Date; end: Date } | null {
  // quarterKey format: "2024-Q1"
  const match = quarterKey.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const q = parseInt(match[2]);
  const startMonth = (q - 1) * 3; // 0, 3, 6, 9
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start, end };
}

function getYearRange(yearKey: string): { start: Date; end: Date } | null {
  const year = parseInt(yearKey);
  if (isNaN(year)) return null;
  const start = new Date(Date.UTC(year, 0, 1));
  const end = new Date(Date.UTC(year + 1, 0, 1));
  return { start, end };
}

function getMonthRange(monthKey: string): { start: Date; end: Date } | null {
  // monthKey format: "2024-01"
  const match = monthKey.match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const month = parseInt(match[2]) - 1;
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 1));
  return { start, end };
}

async function computeActuals(loIds: string[], start: Date, end: Date) {
  if (loIds.length === 0) {
    return { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };
  }
  const disbursedLoans = await db.loanApplicants.findMany({
    where: {
      staffId: { in: loIds },
      disbursedAt: { gte: start, lt: end },
    },
    select: { id: true, amount: true, finalAmount: true, staffId: true },
  });
  const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + (l.finalAmount || l.amount), 0);
  const loanCount = disbursedLoans.length;
  const submittedLoans = await db.loanApplicants.count({
    where: {
      staffId: { in: loIds },
      submittedAt: { gte: start, lt: end },
    },
  });
  return { totalDisbursed, loanCount, submittedLoans };
}

async function computeLoBreakdown(loanOfficers: any[], start: Date, end: Date, disbursedLoans: any[]) {
  return Promise.all(loanOfficers.map(async (lo) => {
    const loLoans = disbursedLoans.filter(l => l.staffId === lo.id);
    const loDisbursed = loLoans.reduce((sum, l) => sum + (l.finalAmount || l.amount), 0);
    return {
      staffId: lo.id,
      name: `${lo.firstName} ${lo.lastName}`,
      monthlyDisbursementTarget: lo.monthlyDisbursementTarget || 0,
      monthlyLoanCountTarget: lo.monthlyLoanCountTarget || 0,
      quarterlyDisbursementTarget: lo.quarterlyDisbursementTarget || 0,
      quarterlyLoanCountTarget: lo.quarterlyLoanCountTarget || 0,
      annualDisbursementTarget: lo.annualDisbursementTarget || 0,
      annualLoanCountTarget: lo.annualLoanCountTarget || 0,
      actualDisbursed: loDisbursed,
      actualLoans: loLoans.length,
      progress: lo.monthlyDisbursementTarget
        ? Math.round((loDisbursed / lo.monthlyDisbursementTarget) * 100)
        : 0,
    };
  }));
}

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
        // Monthly
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
        targetMonth: true,
        // Quarterly (v41)
        quarterlyDisbursementTarget: true, quarterlyLoanCountTarget: true,
        targetQuarter: true,
        // Annual (v41)
        annualDisbursementTarget: true, annualLoanCountTarget: true,
        targetYear: true,
        // Common
        targetSetAt: true, targetSetBy: true, targetPeriodType: true,
      },
    });

    if (!branch) return NextResponse.json({ error: 'Branch not found' }, { status: 404 });

    // Get all loan officers in this branch
    const loanOfficers = await db.admin.findMany({
      where: { branchId, role: 'loan', status: 1 },
      select: {
        id: true, firstName: true, lastName: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true,
        quarterlyDisbursementTarget: true, quarterlyLoanCountTarget: true,
        annualDisbursementTarget: true, annualLoanCountTarget: true,
      },
    });

    const loIds = loanOfficers.map(lo => lo.id);

    // ── Monthly actuals ──────────────────────────────────────────────────
    const currentMonth = branch.targetMonth || new Date().toISOString().slice(0, 7);
    const monthRange = getMonthRange(currentMonth) || {
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    };
    const monthlyDisbursedLoans = loIds.length > 0 ? await db.loanApplicants.findMany({
      where: { staffId: { in: loIds }, disbursedAt: { gte: monthRange.start, lt: monthRange.end } },
      select: { id: true, amount: true, finalAmount: true, staffId: true },
    }) : [];
    const monthlyActuals = {
      totalDisbursed: monthlyDisbursedLoans.reduce((s, l) => s + (l.finalAmount || l.amount), 0),
      loanCount: monthlyDisbursedLoans.length,
      submittedLoans: loIds.length > 0 ? await db.loanApplicants.count({
        where: { staffId: { in: loIds }, submittedAt: { gte: monthRange.start, lt: monthRange.end } },
      }) : 0,
    };

    // ── Quarterly actuals (v41) ──────────────────────────────────────────
    const currentQuarter = branch.targetQuarter || `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
    const qRange = getQuarterRange(currentQuarter);
    const quarterlyActuals = qRange ? await computeActuals(loIds, qRange.start, qRange.end) : { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };

    // ── Annual actuals (v41) ─────────────────────────────────────────────
    const currentYear = branch.targetYear || String(new Date().getFullYear());
    const yRange = getYearRange(currentYear);
    const annualActuals = yRange ? await computeActuals(loIds, yRange.start, yRange.end) : { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };

    // Per-LO breakdown (monthly)
    const loBreakdown = await computeLoBreakdown(loanOfficers, monthRange.start, monthRange.end, monthlyDisbursedLoans);

    return NextResponse.json({
      branch,
      // Monthly
      target: {
        disbursementTarget: branch.monthlyDisbursementTarget || 0,
        loanCountTarget: branch.monthlyLoanCountTarget || 0,
        month: currentMonth,
        periodType: 'monthly',
      },
      actual: monthlyActuals,
      progress: {
        disbursementPct: branch.monthlyDisbursementTarget
          ? Math.round((monthlyActuals.totalDisbursed / branch.monthlyDisbursementTarget) * 100)
          : 0,
        loanCountPct: branch.monthlyLoanCountTarget
          ? Math.round((monthlyActuals.loanCount / branch.monthlyLoanCountTarget) * 100)
          : 0,
      },
      // v41: Quarterly
      quarterly: {
        target: {
          disbursementTarget: branch.quarterlyDisbursementTarget || 0,
          loanCountTarget: branch.quarterlyLoanCountTarget || 0,
          quarter: currentQuarter,
        },
        actual: quarterlyActuals,
        progress: {
          disbursementPct: branch.quarterlyDisbursementTarget
            ? Math.round((quarterlyActuals.totalDisbursed / branch.quarterlyDisbursementTarget) * 100)
            : 0,
          loanCountPct: branch.quarterlyLoanCountTarget
            ? Math.round((quarterlyActuals.loanCount / branch.quarterlyLoanCountTarget) * 100)
            : 0,
        },
      },
      // v41: Annual
      annual: {
        target: {
          disbursementTarget: branch.annualDisbursementTarget || 0,
          loanCountTarget: branch.annualLoanCountTarget || 0,
          year: currentYear,
        },
        actual: annualActuals,
        progress: {
          disbursementPct: branch.annualDisbursementTarget
            ? Math.round((annualActuals.totalDisbursed / branch.annualDisbursementTarget) * 100)
            : 0,
          loanCountPct: branch.annualLoanCountTarget
            ? Math.round((annualActuals.loanCount / branch.annualLoanCountTarget) * 100)
            : 0,
        },
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
    const { disbursementTarget, loanCountTarget, periodType, periodKey } = body;

    // v41: Build update data based on period type
    const updateData: any = {
      targetSetAt: new Date(),
      targetSetBy: authPayload.id,
      targetPeriodType: periodType || 'monthly',
    };

    if (periodType === 'quarterly') {
      updateData.quarterlyDisbursementTarget = Number(disbursementTarget) || 0;
      updateData.quarterlyLoanCountTarget = Number(loanCountTarget) || 0;
      updateData.targetQuarter = periodKey || `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
    } else if (periodType === 'annual') {
      updateData.annualDisbursementTarget = Number(disbursementTarget) || 0;
      updateData.annualLoanCountTarget = Number(loanCountTarget) || 0;
      updateData.targetYear = periodKey || String(new Date().getFullYear());
    } else {
      // monthly (default)
      updateData.monthlyDisbursementTarget = Number(disbursementTarget) || 0;
      updateData.monthlyLoanCountTarget = Number(loanCountTarget) || 0;
      updateData.targetMonth = periodKey || new Date().toISOString().slice(0, 7);
    }

    const updated = await db.branch.update({
      where: { id: branchId },
      data: updateData,
      select: {
        id: true, name: true, code: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true, targetMonth: true,
        quarterlyDisbursementTarget: true, quarterlyLoanCountTarget: true, targetQuarter: true,
        annualDisbursementTarget: true, annualLoanCountTarget: true, targetYear: true,
        targetPeriodType: true, targetSetAt: true,
      },
    });

    // Audit log
    try {
      await db.auditLog.create({
        data: {
          adminId: authPayload.id,
          action: 'branch_target_set',
          description: `Set ${periodType || 'monthly'} branch target for ${updated.name}: ₦${disbursementTarget} / ${loanCountTarget} loans (${periodKey || 'current period'})`,
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
