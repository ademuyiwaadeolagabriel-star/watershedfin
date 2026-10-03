import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { Prisma } from '@prisma/client';

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

function parseBranchTargetPeriod(
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

function periodRange(periodType: string, periodKey: string): { start: Date; end: Date } | null {
  if (periodType === 'monthly') return getMonthRange(periodKey);
  if (periodType === 'quarterly') return getQuarterRange(periodKey);
  if (periodType === 'annual') return getYearRange(periodKey);
  return null;
}

async function getActiveTarget(branchId: string, metricKey: string, periodType: string, periodStart: Date) {
  return db.branchTarget.findFirst({
    where: { branchId, metricKey, periodType, periodStart, status: 'ACTIVE' },
    orderBy: { version: 'desc' },
  });
}

async function upsertVersionedTarget(
  tx: Prisma.TransactionClient,
  params: {
    branchId: string;
    metricKey: string;
    periodType: string;
    periodStart: Date;
    periodEnd: Date;
    targetValue: number;
    unit: string;
    createdBy: string;
    activate: boolean;
  },
) {
    const previous = await tx.branchTarget.findFirst({
      where: {
        branchId: params.branchId,
        metricKey: params.metricKey,
        periodType: params.periodType,
        periodStart: params.periodStart,
        status: 'ACTIVE',
      },
      orderBy: { version: 'desc' },
    });
    if (previous && params.activate) {
      await tx.branchTarget.update({
        where: { id: previous.id },
        data: { status: 'SUPERSEDED' },
      });
    }
    const max = await tx.branchTarget.aggregate({
      where: {
        branchId: params.branchId,
        metricKey: params.metricKey,
        periodType: params.periodType,
        periodStart: params.periodStart,
      },
      _max: { version: true },
    });
    const created = await tx.branchTarget.create({
      data: {
        branchId: params.branchId,
        metricKey: params.metricKey,
        periodType: params.periodType,
        periodStart: params.periodStart,
        periodEnd: params.periodEnd,
        targetValue: params.targetValue,
        unit: params.unit,
        status: params.activate ? 'ACTIVE' : 'SUBMITTED',
        version: (max._max.version || 0) + 1,
        createdBy: params.createdBy,
        approvedBy: params.activate ? params.createdBy : null,
        approvedAt: params.activate ? new Date() : null,
        reasonForChange: 'Branch target update',
      },
    });
  return created;
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
  // v51 â€” Decimal arithmetic: loanApplicants.finalAmount/amount are Decimal.
  const totalDisbursed = disbursedLoans.reduce((sum, l) => sum + Number(l.finalAmount || l.amount), 0);
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
    const loDisbursed = loLoans.reduce((sum, l) => sum + (Number(l.finalAmount) || Number(l.amount)), 0);
    return {
      staffId: lo.id,
      name: `${lo.firstName} ${lo.lastName}`,
      monthlyDisbursementTarget: Number(lo.monthlyDisbursementTarget) || 0,
      monthlyLoanCountTarget: lo.monthlyLoanCountTarget || 0,
      quarterlyDisbursementTarget: Number(lo.quarterlyDisbursementTarget) || 0,
      quarterlyLoanCountTarget: lo.quarterlyLoanCountTarget || 0,
      annualDisbursementTarget: Number(lo.annualDisbursementTarget) || 0,
      annualLoanCountTarget: lo.annualLoanCountTarget || 0,
      actualDisbursed: loDisbursed,
      actualLoans: loLoans.length,
      progress: Number(lo.monthlyDisbursementTarget)
        ? Math.round((loDisbursed / Number(lo.monthlyDisbursementTarget)) * 100)
        : 0,
    };
  }));
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!['super', 'md', 'hoc', 'bm'].includes(authPayload.role)) {
      return NextResponse.json({ error: 'Insufficient permission to view or manage branch targets.' }, { status: 403 });
    }

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
    if (authPayload.role === 'bm' && branch.managerId !== authPayload.id) {
      return NextResponse.json({ error: 'Access denied â€” this is not your branch.' }, { status: 403 });
    }

    const activeTargets = await db.branchTarget.findMany({
      where: { branchId, status: 'ACTIVE', metricKey: { in: ['disbursement_amount', 'loan_count'] } },
      orderBy: { version: 'desc' },
    });
    const submittedTargets = await db.branchTarget.findMany({
      where: { branchId, status: 'SUBMITTED', metricKey: { in: ['disbursement_amount', 'loan_count'] } },
      orderBy: { createdAt: 'desc' },
    });
    const latestActive = new Map<string, any>();
    for (const t of activeTargets) {
      const key = `${t.metricKey}|${t.periodType}|${t.periodStart.toISOString()}`;
      if (!latestActive.has(key)) latestActive.set(key, t);
    }

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

    // â”€â”€ Monthly actuals â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const now = new Date();
    const calendarMonth = now.toISOString().slice(0, 7);
    const calendarQuarter = `${now.getUTCFullYear()}-Q${Math.floor(now.getUTCMonth() / 3) + 1}`;
    const calendarYear = String(now.getUTCFullYear());

    const hasActiveTargetFor = (metricKey: string, periodType: string, periodKey: string) =>
      activeTargets.some(t => {
        if (t.metricKey !== metricKey || t.periodType !== periodType) return false;
        if (periodType === 'monthly') {
          return `${t.periodStart.getUTCFullYear()}-${String(t.periodStart.getUTCMonth() + 1).padStart(2, '0')}` === periodKey;
        }
        if (periodType === 'quarterly') {
          return `${t.periodStart.getUTCFullYear()}-Q${Math.floor(t.periodStart.getUTCMonth() / 3) + 1}` === periodKey;
        }
        if (periodType === 'annual') {
          return String(t.periodStart.getUTCFullYear()) === periodKey;
        }
        return false;
      });

    const currentMonth =
      hasActiveTargetFor('disbursement_amount', 'monthly', calendarMonth) ||
      hasActiveTargetFor('loan_count', 'monthly', calendarMonth)
        ? calendarMonth
        : branch.targetMonth || calendarMonth;
    const monthRange = getMonthRange(currentMonth) || {
      start: new Date(new Date().getFullYear(), new Date().getMonth(), 1),
      end: new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1),
    };
    const monthlyDisbursedLoans = loIds.length > 0 ? await db.loanApplicants.findMany({
      where: { staffId: { in: loIds }, disbursedAt: { gte: monthRange.start, lt: monthRange.end } },
      select: { id: true, amount: true, finalAmount: true, staffId: true },
    }) : [];
    const monthlyActuals = {
      // v51 â€” Decimal arithmetic.
      totalDisbursed: monthlyDisbursedLoans.reduce((s, l) => s + Number(l.finalAmount || l.amount), 0),
      loanCount: monthlyDisbursedLoans.length,
      submittedLoans: loIds.length > 0 ? await db.loanApplicants.count({
        where: { staffId: { in: loIds }, submittedAt: { gte: monthRange.start, lt: monthRange.end } },
      }) : 0,
    };

    // â”€â”€ Quarterly actuals (v41) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const currentQuarter = (hasActiveTargetFor('disbursement_amount', 'quarterly', calendarQuarter) || hasActiveTargetFor('loan_count', 'quarterly', calendarQuarter)) ? calendarQuarter : (branch.targetQuarter || calendarQuarter);
    const qRange = getQuarterRange(currentQuarter);
    const quarterlyActuals = qRange ? await computeActuals(loIds, qRange.start, qRange.end) : { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };

    // â”€â”€ Annual actuals (v41) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
    const currentYear = (hasActiveTargetFor('disbursement_amount', 'annual', calendarYear) || hasActiveTargetFor('loan_count', 'annual', calendarYear)) ? calendarYear : (branch.targetYear || calendarYear);
    const yRange = getYearRange(currentYear);
    const annualActuals = yRange ? await computeActuals(loIds, yRange.start, yRange.end) : { totalDisbursed: 0, loanCount: 0, submittedLoans: 0 };

    // Resolve authoritative governance targets once so displayed targets
    // and progress percentages always use the same denominator.
    const monthlyDisbursementTarget = Number(latestActive.get(`disbursement_amount|monthly|${monthRange.start.toISOString()}`)?.targetValue ?? branch.monthlyDisbursementTarget ?? 0);
    const monthlyLoanCountTarget = Number(latestActive.get(`loan_count|monthly|${monthRange.start.toISOString()}`)?.targetValue ?? branch.monthlyLoanCountTarget ?? 0);
    const quarterlyDisbursementTarget = Number(latestActive.get(`disbursement_amount|quarterly|${qRange?.start.toISOString()}`)?.targetValue ?? branch.quarterlyDisbursementTarget ?? 0);
    const quarterlyLoanCountTarget = Number(latestActive.get(`loan_count|quarterly|${qRange?.start.toISOString()}`)?.targetValue ?? branch.quarterlyLoanCountTarget ?? 0);
    const annualDisbursementTarget = Number(latestActive.get(`disbursement_amount|annual|${yRange?.start.toISOString()}`)?.targetValue ?? branch.annualDisbursementTarget ?? 0);
    const annualLoanCountTarget = Number(latestActive.get(`loan_count|annual|${yRange?.start.toISOString()}`)?.targetValue ?? branch.annualLoanCountTarget ?? 0);

    // Per-LO breakdown (monthly)
    const loBreakdown = await computeLoBreakdown(loanOfficers, monthRange.start, monthRange.end, monthlyDisbursedLoans);

    return NextResponse.json({
      branch,
      governance: {
        activeTargets: activeTargets.map(t => ({ id: t.id, metricKey: t.metricKey, periodType: t.periodType, periodStart: t.periodStart, periodEnd: t.periodEnd, targetValue: Number(t.targetValue), unit: t.unit, version: t.version })),
        submittedTargets: submittedTargets.map(t => ({ id: t.id, metricKey: t.metricKey, periodType: t.periodType, periodStart: t.periodStart, periodEnd: t.periodEnd, targetValue: Number(t.targetValue), unit: t.unit, version: t.version, createdBy: t.createdBy })),
      },
      // Monthly
      target: {
        disbursementTarget: monthlyDisbursementTarget,
        loanCountTarget: monthlyLoanCountTarget,
        month: currentMonth,
        periodType: 'monthly',
      },
      actual: monthlyActuals,
      progress: {
        // v51 â€” Decimal arithmetic: branch.*DisbursementTarget is Decimal, wrap with Number().
        disbursementPct: monthlyDisbursementTarget > 0
          ? Math.round((monthlyActuals.totalDisbursed / monthlyDisbursementTarget) * 100)
          : 0,
        loanCountPct: monthlyLoanCountTarget > 0
          ? Math.round((monthlyActuals.loanCount / monthlyLoanCountTarget) * 100)
          : 0,
      },
      // v41: Quarterly
      quarterly: {
        target: {
          disbursementTarget: quarterlyDisbursementTarget,
          loanCountTarget: quarterlyLoanCountTarget,
          quarter: currentQuarter,
        },
        actual: quarterlyActuals,
        progress: {
          disbursementPct: quarterlyDisbursementTarget > 0
            ? Math.round((quarterlyActuals.totalDisbursed / quarterlyDisbursementTarget) * 100)
            : 0,
          loanCountPct: quarterlyLoanCountTarget > 0
            ? Math.round((quarterlyActuals.loanCount / quarterlyLoanCountTarget) * 100)
            : 0,
        },
      },
      // v41: Annual
      annual: {
        target: {
          disbursementTarget: annualDisbursementTarget,
          loanCountTarget: annualLoanCountTarget,
          year: currentYear,
        },
        actual: annualActuals,
        progress: {
          disbursementPct: annualDisbursementTarget > 0
            ? Math.round((annualActuals.totalDisbursed / annualDisbursementTarget) * 100)
            : 0,
          loanCountPct: annualLoanCountTarget > 0
            ? Math.round((annualActuals.loanCount / annualLoanCountTarget) * 100)
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
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    if (!['super', 'md', 'hoc', 'bm'].includes(authPayload.role)) {
      return NextResponse.json({ error: 'Insufficient permission to view or manage branch targets.' }, { status: 403 });
    }

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

    const body = await req.json().catch(() => ({}));

    const requestedPeriodType = body.periodType || 'monthly';

    const keyDefault =
      requestedPeriodType === 'monthly'
        ? new Date().toISOString().slice(0, 7)
        : requestedPeriodType === 'quarterly'
          ? `${new Date().getUTCFullYear()}-Q${Math.floor(new Date().getUTCMonth() / 3) + 1}`
          : requestedPeriodType === 'annual'
            ? String(new Date().getUTCFullYear())
            : '';

    const effectiveKey = String(body.periodKey || keyDefault);
    const period = parseBranchTargetPeriod(requestedPeriodType, effectiveKey);

    if (!period) {
      return NextResponse.json(
        {
          error:
            'Invalid target period. Use monthly YYYY-MM, quarterly YYYY-Q1..Q4, or annual YYYY.',
        },
        { status: 400 }
      );
    }

    const range = periodRange(period.type, period.key);
    if (!range) {
      return NextResponse.json({ error: 'Invalid periodKey for periodType.' }, { status: 400 });
    }

    const disb = Number(body.disbursementTarget);
    const count = Number(body.loanCountTarget);

    if (!Number.isFinite(disb) || disb < 0) {
      return NextResponse.json(
        { error: 'disbursementTarget must be a non-negative number.' },
        { status: 400 }
      );
    }

    if (!Number.isFinite(count) || count < 0 || !Number.isInteger(count)) {
      return NextResponse.json(
        { error: 'loanCountTarget must be a non-negative integer.' },
        { status: 400 }
      );
    }

    const activate = ['super', 'md', 'hoc'].includes(authPayload.role);
    const createdBy = authPayload.id;

    const result = await db.$transaction(
      async (tx) => {
        const targets = await Promise.all([
          upsertVersionedTarget(tx, {
            branchId,
            metricKey: 'disbursement_amount',
            periodType: period.type,
            periodStart: range.start,
            periodEnd: range.end,
            targetValue: disb,
            unit: 'NGN',
            createdBy,
            activate,
          }),
          upsertVersionedTarget(tx, {
            branchId,
            metricKey: 'loan_count',
            periodType: period.type,
            periodStart: range.start,
            periodEnd: range.end,
            targetValue: count,
            unit: 'count',
            createdBy,
            activate,
          }),
        ]);

        await tx.auditLog.create({
          data: {
            adminId: createdBy,
            action: 'branch_target_set',
            description: `Created ${period.type} branch target version for ${branch.name}`,
            module: 'targets',
            severity: 'info',
            metadata: JSON.stringify({
              branchId,
              periodType: period.type,
              periodKey: period.key,
              status: activate ? 'ACTIVE' : 'SUBMITTED',
              targets: targets.map((t) => ({
                id: t.id,
                metricKey: t.metricKey,
                targetValue: Number(t.targetValue),
                version: t.version,
              })),
            }),
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
          },
        });

        return targets;
      },
      {
        isolationLevel: Prisma.TransactionIsolationLevel.Serializable,
        maxWait: 5000,
        timeout: 15000,
      },
    );

    return NextResponse.json({
      success: true,
      status: activate ? 'ACTIVE' : 'SUBMITTED',
      targets: result,
      message: activate
        ? 'Branch targets activated.'
        : 'Branch targets submitted for approval.',
    });

  } catch (e: any) {
    console.error('Branch target POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}


