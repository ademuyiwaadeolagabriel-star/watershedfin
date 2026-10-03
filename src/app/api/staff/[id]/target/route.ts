import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

// ============================================================================
// GET /api/staff/[id]/target
// POST /api/staff/[id]/target
//
// v41: Now supports three target period types (monthly, quarterly, annual).
// The GET endpoint returns ALL three periods' targets + actuals.
// The POST endpoint accepts a `periodType` field to determine which to update.
// ============================================================================

function parseTargetPeriod(
  periodType: unknown,
  periodKey: unknown,
): { type: 'monthly' | 'quarterly' | 'annual'; key: string } | null {
  const type = String(periodType || 'monthly');
  const key = String(periodKey || '');

  if (!['monthly', 'quarterly', 'annual'].includes(type)) return null;

  if (type === 'monthly' && !/^\d{4}-(0[1-9]|1[0-2])$/.test(key)) return null;
  if (type === 'quarterly' && !/^\d{4}-Q[1-4]$/.test(key)) return null;
  if (type === 'annual' && !/^\d{4}$/.test(key)) return null;

  return {
    type: type as 'monthly' | 'quarterly' | 'annual',
    key,
  };
}

function getQuarterRange(quarterKey: string): { start: Date; end: Date } | null {
  const match = quarterKey.match(/^(\d{4})-Q([1-4])$/);
  if (!match) return null;
  const year = parseInt(match[1]);
  const q = parseInt(match[2]);
  const startMonth = (q - 1) * 3;
  const start = new Date(Date.UTC(year, startMonth, 1));
  const end = new Date(Date.UTC(year, startMonth + 3, 1));
  return { start, end };
}

function getYearRange(yearKey: string): { start: Date; end: Date } | null {
  const year = parseInt(yearKey);
  if (isNaN(year)) return null;
  return { start: new Date(Date.UTC(year, 0, 1)), end: new Date(Date.UTC(year + 1, 0, 1)) };
}

async function computeActuals(staffId: string, start: Date, end: Date) {
  const disbursedLoans = await db.loanApplicants.findMany({
    where: { staffId, disbursedAt: { gte: start, lt: end } },
    select: { id: true, amount: true, finalAmount: true, status: true },
  });
  // v51 — Decimal arithmetic: finalAmount/amount are Decimal, wrap with Number().
  const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + Number(l.finalAmount || l.amount), 0);
  const loanCount = disbursedLoans.length;
  const submittedLoans = await db.loanApplicants.count({
    where: { staffId, submittedAt: { gte: start, lt: end } },
  });
  return { totalDisbursed, loanCount, submittedLoans };
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { id: staffId } = await params;
    const staff = await db.admin.findUnique({
      where: { id: staffId },
      select: {
        id: true, firstName: true, lastName: true, role: true, branchId: true,
        // Monthly
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true, targetMonth: true,
        // v41 Quarterly
        quarterlyDisbursementTarget: true, quarterlyLoanCountTarget: true, targetQuarter: true,
        // v41 Annual
        annualDisbursementTarget: true, annualLoanCountTarget: true, targetYear: true,
        // Common
        targetSetAt: true, targetSetBy: true, targetPeriodType: true,
      },
    });

    if (!staff) return NextResponse.json({ error: 'Staff not found' }, { status: 404 });

    const privilegedViewer = ['super', 'md', 'hoc', 'cro', 'cfo', 'hr'].includes(authPayload.role);

    if (!privilegedViewer) {
      if (authPayload.role === 'bm') {
        if (!authPayload.branchId || staff.branchId !== authPayload.branchId) {
          return NextResponse.json(
            { error: 'You can only view staff targets within your own branch.' },
            { status: 403 }
          );
        }
      } else if (staff.id !== authPayload.id) {
        return NextResponse.json(
          { error: 'You are not authorized to view this staff target.' },
          { status: 403 }
        );
      }
    }


    // ── Monthly actuals ──────────────────────────────────────────────────
    const currentMonth = staff.targetMonth || new Date().toISOString().slice(0, 7);
    const monthStart = new Date(`${currentMonth}-01T00:00:00.000Z`);
    const monthEnd = new Date(monthStart);
    monthEnd.setMonth(monthEnd.getMonth() + 1);
    const monthlyActuals = await computeActuals(staffId, monthStart, monthEnd);

    // ── Quarterly actuals (v41) ──────────────────────────────────────────
    const currentQuarter = staff.targetQuarter || `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`;
    const qRange = getQuarterRange(currentQuarter);
    const quarterlyActuals = qRange ? await computeActuals(staffId, qRange.start, qRange.end) : { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };

    // ── Annual actuals (v41) ─────────────────────────────────────────────
    const currentYear = staff.targetYear || String(new Date().getFullYear());
    const yRange = getYearRange(currentYear);
    const annualActuals = yRange ? await computeActuals(staffId, yRange.start, yRange.end) : { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };

    return NextResponse.json({
      staff,
      // Monthly
      target: {
        disbursementTarget: staff.monthlyDisbursementTarget || 0,
        loanCountTarget: staff.monthlyLoanCountTarget || 0,
        month: currentMonth,
        periodType: 'monthly',
      },
      actual: monthlyActuals,
      progress: {
        // v51 — Decimal arithmetic: staff.*DisbursementTarget is Decimal, wrap with Number().
        disbursementPct: staff.monthlyDisbursementTarget
          ? Math.round((monthlyActuals.totalDisbursed / Number(staff.monthlyDisbursementTarget)) * 100)
          : 0,
        loanCountPct: staff.monthlyLoanCountTarget
          ? Math.round((monthlyActuals.loanCount / staff.monthlyLoanCountTarget) * 100)
          : 0,
      },
      // v41: Quarterly
      quarterly: {
        target: {
          disbursementTarget: staff.quarterlyDisbursementTarget || 0,
          loanCountTarget: staff.quarterlyLoanCountTarget || 0,
          quarter: currentQuarter,
        },
        actual: quarterlyActuals,
        progress: {
          // v51 — Decimal arithmetic: staff.*DisbursementTarget is Decimal, wrap with Number().
          disbursementPct: staff.quarterlyDisbursementTarget
            ? Math.round((quarterlyActuals.totalDisbursed / Number(staff.quarterlyDisbursementTarget)) * 100)
            : 0,
          loanCountPct: staff.quarterlyLoanCountTarget
            ? Math.round((quarterlyActuals.loanCount / staff.quarterlyLoanCountTarget) * 100)
            : 0,
        },
      },
      // v41: Annual
      annual: {
        target: {
          disbursementTarget: staff.annualDisbursementTarget || 0,
          loanCountTarget: staff.annualLoanCountTarget || 0,
          year: currentYear,
        },
        actual: annualActuals,
        progress: {
          // v51 — Decimal arithmetic: staff.*DisbursementTarget is Decimal, wrap with Number().
          disbursementPct: staff.annualDisbursementTarget
            ? Math.round((annualActuals.totalDisbursed / Number(staff.annualDisbursementTarget)) * 100)
            : 0,
          loanCountPct: staff.annualLoanCountTarget
            ? Math.round((annualActuals.loanCount / staff.annualLoanCountTarget) * 100)
            : 0,
        },
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
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { id: staffId } = await params;

    // v29 — BM can set target for themselves AND for LOs in their branch
    if (authPayload.role === 'bm') {
      if (staffId !== authPayload.id) {
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
        const bm = await db.admin.findUnique({
          where: { id: authPayload.id },
          select: { branchId: true },
        });
        if (bm?.branchId && targetStaff.branchId !== bm.branchId) {
          return NextResponse.json({ error: 'BM can only set targets for LOs in their own branch' }, { status: 403 });
        }
      }
    } else {
      const allowedRoles = ['super', 'md', 'hoc'];
      if (!allowedRoles.includes(authPayload.role)) {
        return NextResponse.json({ error: 'Only HOC, MD, Super Admin, or BM (for own branch LOs) can set targets' }, { status: 403 });
      }
    }

    const body = await req.json().catch(() => ({}));

    const rawDisbursement = Number(body.disbursementTarget);
    const rawLoanCount = Number(body.loanCountTarget);

    if (!Number.isFinite(rawDisbursement) || rawDisbursement < 0) {
      return NextResponse.json(
        { error: 'disbursementTarget must be a non-negative number.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(rawLoanCount) || rawLoanCount < 0 || !Number.isInteger(rawLoanCount)) {
      return NextResponse.json(
        { error: 'loanCountTarget must be a non-negative integer.' },
        { status: 400 }
      );
    }

    const requestedPeriodType = body.periodType || 'monthly';

    // Preserve the legacy "month" field for compatibility while making
    // periodKey the canonical API contract.
    const requestedPeriodKey =
      body.periodKey ||
      body.month ||
      (requestedPeriodType === 'quarterly'
        ? `${new Date().getFullYear()}-Q${Math.floor(new Date().getMonth() / 3) + 1}`
        : requestedPeriodType === 'annual'
          ? String(new Date().getFullYear())
          : new Date().toISOString().slice(0, 7));

    const period = parseTargetPeriod(requestedPeriodType, requestedPeriodKey);

    if (!period) {
      return NextResponse.json(
        {
          error:
            'Invalid target period. Use monthly YYYY-MM, quarterly YYYY-Q1..Q4, or annual YYYY.',
        },
        { status: 400 }
      );
    }

    const updateData: any = {
      targetSetAt: new Date(),
      targetSetBy: authPayload.id,
      targetPeriodType: period.type,
    };

    if (period.type === 'quarterly') {
      updateData.quarterlyDisbursementTarget = rawDisbursement;
      updateData.quarterlyLoanCountTarget = rawLoanCount;
      updateData.targetQuarter = period.key;
    } else if (period.type === 'annual') {
      updateData.annualDisbursementTarget = rawDisbursement;
      updateData.annualLoanCountTarget = rawLoanCount;
      updateData.targetYear = period.key;
    } else {
      updateData.monthlyDisbursementTarget = rawDisbursement;
      updateData.monthlyLoanCountTarget = rawLoanCount;
      updateData.targetMonth = period.key;
    }

    const updated = await db.admin.update({
      where: { id: staffId },
      data: updateData,
      select: {
        id: true, firstName: true, lastName: true,
        monthlyDisbursementTarget: true, monthlyLoanCountTarget: true, targetMonth: true,
        quarterlyDisbursementTarget: true, quarterlyLoanCountTarget: true, targetQuarter: true,
        annualDisbursementTarget: true, annualLoanCountTarget: true, targetYear: true,
        targetPeriodType: true, targetSetAt: true,
      },
    });

    return NextResponse.json({ success: true, target: updated });
  } catch (e: any) {
    console.error('Target POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
