import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';

// ============================================================================
// /api/branches/[id]/targets
//   GET    — list all BranchTarget rows for this branch (all metrics, all periods)
//   POST   — create or update a target (new version, old version retained)
//
// v4 — Branch Target Management.
// Uses the new BranchTarget model with versioning + status workflow.
// ============================================================================

const METRIC_CATALOG = [
  // Business Development
  { metricKey: 'disbursement_amount', label: 'Disbursement Amount', category: 'business', unit: 'NGN', direction: 'higher_is_better' },
  { metricKey: 'loan_count', label: 'Loan Count', category: 'business', unit: 'count', direction: 'higher_is_better' },
  { metricKey: 'new_customers', label: 'New Customers', category: 'business', unit: 'count', direction: 'higher_is_better' },
  { metricKey: 'repeat_borrowers', label: 'Repeat Borrowers', category: 'business', unit: 'count', direction: 'higher_is_better' },
  { metricKey: 'approval_count', label: 'Approval Count', category: 'business', unit: 'count', direction: 'higher_is_better' },
  // Credit Quality
  { metricKey: 'par30', label: 'PAR 30', category: 'credit_quality', unit: 'percent', direction: 'lower_is_better' },
  { metricKey: 'npl_ratio', label: 'NPL Ratio', category: 'credit_quality', unit: 'percent', direction: 'lower_is_better' },
  { metricKey: 'first_payment_success_rate', label: 'First Payment Success Rate', category: 'credit_quality', unit: 'percent', direction: 'higher_is_better' },
  { metricKey: 'early_default_rate', label: 'Early Default Rate', category: 'credit_quality', unit: 'percent', direction: 'lower_is_better' },
  // Collections
  { metricKey: 'collection_rate', label: 'Collection Rate', category: 'collections', unit: 'percent', direction: 'higher_is_better' },
  { metricKey: 'recovery_rate', label: 'Recovery Rate', category: 'collections', unit: 'percent', direction: 'higher_is_better' },
  { metricKey: 'overdue_amount', label: 'Overdue Amount', category: 'collections', unit: 'NGN', direction: 'lower_is_better' },
  // Customer
  { metricKey: 'active_customers', label: 'Active Customers', category: 'customer', unit: 'count', direction: 'higher_is_better' },
  { metricKey: 'customer_retention', label: 'Customer Retention', category: 'customer', unit: 'percent', direction: 'higher_is_better' },
  { metricKey: 'referrals', label: 'Referrals', category: 'customer', unit: 'count', direction: 'higher_is_better' },
  // Operations
  { metricKey: 'avg_turnaround_hours', label: 'Avg Turnaround (hrs)', category: 'operations', unit: 'hours', direction: 'lower_is_better' },
  { metricKey: 'sla_breaches', label: 'SLA Breaches', category: 'operations', unit: 'count', direction: 'lower_is_better' },
  { metricKey: 'application_turnaround', label: 'Application Turnaround', category: 'operations', unit: 'hours', direction: 'lower_is_better' },
  // Field Operations
  { metricKey: 'field_visits', label: 'Field Visits', category: 'operations', unit: 'count', direction: 'higher_is_better' },
  { metricKey: 'gps_verified_visits', label: 'GPS-Verified Visits', category: 'operations', unit: 'count', direction: 'higher_is_better' },
  // Financial
  { metricKey: 'interest_income', label: 'Interest Income', category: 'financial', unit: 'NGN', direction: 'higher_is_better' },
  { metricKey: 'fee_income', label: 'Fee Income', category: 'financial', unit: 'NGN', direction: 'higher_is_better' },
  { metricKey: 'branch_expense', label: 'Branch Expense', category: 'financial', unit: 'NGN', direction: 'lower_is_better' },
  { metricKey: 'contribution', label: 'Branch Contribution', category: 'financial', unit: 'NGN', direction: 'higher_is_better' },
];

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'cfo', 'bm', 'loan', 'lo', 'cs', 'compliance']);
  if (authResult instanceof NextResponse) return authResult;

  try {
    const { id } = await params;
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const metricKey = url.searchParams.get('metric');

    const where: any = { branchId: id };
    if (status) where.status = status;
    if (metricKey) where.metricKey = metricKey;

    const targets = await db.branchTarget.findMany({
      where,
      orderBy: [{ periodStart: 'desc' }, { version: 'desc' }],
    });

    return NextResponse.json({
      targets: targets.map(t => ({
        ...t,
        targetValue: Number(t.targetValue),
      })),
      metricCatalog: METRIC_CATALOG,
    });
  } catch (e: any) {
    console.error('Branch targets GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'bm']);
  if (authResult instanceof NextResponse) return authResult;
  const authPayload = authResult as { id: string; role: string };

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { metricKey, periodType, periodStart, periodEnd, targetValue, unit, reasonForChange, templateId } = body || {};

    if (!metricKey || !periodType || !periodStart || !targetValue) {
      return NextResponse.json(
        { error: 'metricKey, periodType, periodStart, targetValue are required' },
        { status: 400 },
      );
    }

    const metricMeta = METRIC_CATALOG.find(m => m.metricKey === metricKey);
    if (!metricMeta) {
      return NextResponse.json(
        { error: `Unknown metric: ${metricKey}. Available: ${METRIC_CATALOG.map(m => m.metricKey).join(', ')}` },
        { status: 400 },
      );
    }

    const startDate = new Date(periodStart);
    const endDate = periodEnd ? new Date(periodEnd) : new Date(startDate.getFullYear(), startDate.getMonth() + 1, 0, 23, 59, 59);

    // Find any existing ACTIVE target for this (branch, metric, period) to supersede
    const priorActive = await db.branchTarget.findFirst({
      where: {
        branchId: id,
        metricKey,
        periodType,
        periodStart: startDate,
        status: 'ACTIVE',
      },
    });

    const maxVersionResult = await db.branchTarget.aggregate({
      where: { branchId: id, metricKey, periodType, periodStart: startDate },
      _max: { version: true },
    });
    const nextVersion = (maxVersionResult._max.version || 0) + 1;

    // v4 — atomic: supersede prior + insert new in one transaction
    const result = await db.$transaction(async (tx) => {
      if (priorActive) {
        await tx.branchTarget.update({
          where: { id: priorActive.id },
          data: { status: 'SUPERSEDED' },
        });
      }

      // Determine the status: if creator is super/md/hoc/cro, auto-approve;
      // if bm, leave as DRAFT for approval
      const isApprover = ['super', 'md', 'hoc', 'cro'].includes(authPayload.role);
      const status = isApprover ? 'ACTIVE' : 'DRAFT';

      const newTarget = await tx.branchTarget.create({
        data: {
          branchId: id,
          metricKey,
          periodType,
          periodStart: startDate,
          periodEnd: endDate,
          targetValue: Number(targetValue),
          unit: unit || metricMeta.unit,
          status,
          version: nextVersion,
          createdBy: authPayload.id,
          approvedBy: isApprover ? authPayload.id : null,
          approvedAt: isApprover ? new Date() : null,
          reasonForChange: reasonForChange || null,
          templateId: templateId || null,
        },
      });

      // Also update the legacy Branch/Admin columns for backward compat
      if (metricKey === 'disbursement_amount' && periodType === 'monthly') {
        await tx.branch.update({
          where: { id },
          data: {
            monthlyDisbursementTarget: Number(targetValue),
            targetMonth: startDate.toISOString().slice(0, 7),
            targetSetAt: new Date(),
            targetSetBy: authPayload.id,
          },
        });
      }

      await tx.auditLog.create({
        data: {
          adminId: authPayload.id,
          action: 'created',
          module: 'branch_target',
          description: `Set ${metricMeta.label} target for branch ${id} (${periodType} ${startDate.toISOString().slice(0, 10)}): ${targetValue} ${metricMeta.unit}`,
          severity: 'info',
          metadata: JSON.stringify({
            branchId: id, metricKey, periodType, targetValue, unit: metricMeta.unit,
            version: nextVersion, supersedes: priorActive?.id || null,
            authSource: 'jwt',
          }),
        },
      });

      return newTarget;
    });

    return NextResponse.json({
      target: { ...result, targetValue: Number(result.targetValue) },
      superseded: priorActive ? { id: priorActive.id, version: priorActive.version } : null,
      metricCatalog: METRIC_CATALOG,
    });
  } catch (e: any) {
    console.error('Branch targets POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT — approve/reject a DRAFT target
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireRole(req, ['super', 'md', 'hoc', 'cro']);
  if (authResult instanceof NextResponse) return authResult;
  const authPayload = authResult as { id: string; role: string };

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const { targetId, action, reason } = body || {};

    if (!targetId || !action) {
      return NextResponse.json({ error: 'targetId and action are required' }, { status: 400 });
    }

    if (!['approve', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'action must be "approve" or "reject"' }, { status: 400 });
    }

    if (action === 'reject' && (!reason || String(reason).trim().length === 0)) {
      return NextResponse.json({ error: 'A non-empty reason is required for rejection.' }, { status: 400 });
    }

    const target = await db.branchTarget.findUnique({ where: { id: targetId } });
    if (!target) {
      return NextResponse.json({ error: 'Target not found' }, { status: 404 });
    }
    if (target.branchId !== id) {
      return NextResponse.json({ error: 'Target does not belong to this branch' }, { status: 403 });
    }
    if (target.status !== 'DRAFT' && target.status !== 'SUBMITTED') {
      return NextResponse.json({ error: `Target is ${target.status}, cannot ${action}` }, { status: 400 });
    }

    // If approving, supersede any prior ACTIVE target for the same (branch, metric, period)
    let priorActive: any = null;
    if (action === 'approve') {
      priorActive = await db.branchTarget.findFirst({
        where: {
          branchId: id,
          metricKey: target.metricKey,
          periodType: target.periodType,
          periodStart: target.periodStart,
          status: 'ACTIVE',
          id: { not: targetId },
        },
      });
    }

    const updated = await db.$transaction(async (tx) => {
      if (priorActive) {
        await tx.branchTarget.update({
          where: { id: priorActive.id },
          data: { status: 'SUPERSEDED' },
        });
      }

      return tx.branchTarget.update({
        where: { id: targetId },
        data: {
          status: action === 'approve' ? 'ACTIVE' : 'REJECTED',
          approvedBy: authPayload.id,
          approvedAt: action === 'approve' ? new Date() : null,
          reasonForChange: reason || target.reasonForChange,
        },
      });
    });

    return NextResponse.json({
      target: { ...updated, targetValue: Number(updated.targetValue) },
      superseded: priorActive ? { id: priorActive.id } : null,
    });
  } catch (e: any) {
    console.error('Branch targets PUT error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
