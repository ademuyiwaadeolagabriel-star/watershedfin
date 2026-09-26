import { NextRequest, NextResponse } from 'next/server';
import { requireCustomerAuth, requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/customer/restructure
//   GET  — customer fetches their OWN restructuring requests
//   POST — customer creates a restructuring request (cannot self-approve)
//
// v53 — P1 #6 fix: this route is now customer-only. The previous
// implementation exposed a PUT endpoint with requireCustomerAuth that
// accepted body.adminId and could approve/reject restructuring + mutate
// loan tenor/maturity. That was a customer-impersonating-admin bypass.
// The admin PUT path has been moved to /api/admin/restructure/[id]/route.ts
// (new route, see that file) with requireRole(['super','md','hoc','cro']).
// ============================================================================

export async function GET(req: NextRequest) {
  // v51 — customer auth gate.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };
  // v53 — IDOR fix: userId from JWT.
  const userId = authPayload_v51.id;

  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    const where: any = { userId };
    if (status && status !== 'all') where.status = status;

    const requests = await db.loanRestructuring.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with loan + user details
    const loanIds = Array.from(new Set(requests.map((r) => r.loanApplicantId).filter(Boolean))) as string[];
    const loans = loanIds.length > 0
      ? await db.loanApplicants.findMany({
          where: { id: { in: loanIds } },
          select: {
            id: true,
            applicationRef: true,
            amount: true,
            approvedAmount: true,
            duration: true,
            status: true,
          },
        }).catch(() => [])
      : [];

    const loanMap = new Map<string, any>(loans.map((l: any) => [l.id, l] as [string, any]));

    const enriched = requests.map((r) => ({
      ...r,
      loanApplicant: loanMap.get(r.loanApplicantId) || null,
    }));

    return NextResponse.json({ requests: enriched });
  } catch (e: any) {
    console.error('Customer restructure GET error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v51 — customer auth gate.
  const authResult_v51 = await requireCustomerAuth(req);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  const authPayload_v51 = authResult_v51 as { id: string; type: string };
  // v53 — IDOR fix: userId from JWT.
  const userId = authPayload_v51.id;

  try {
    const body = await req.json().catch(() => ({}));
    const { loanId, requestType, requestedTenor, reason } = body || {};

    if (!loanId) {
      return NextResponse.json({ error: 'loanId is required' }, { status: 400 });
    }
    if (!requestType || !['extend_tenor', 'reduce_payment', 'grace_period'].includes(requestType)) {
      return NextResponse.json(
        { error: 'requestType must be one of: extend_tenor, reduce_payment, grace_period' },
        { status: 400 },
      );
    }
    if (!requestedTenor || requestedTenor <= 0) {
      return NextResponse.json(
        { error: 'requestedTenor must be a positive integer (months)' },
        { status: 400 },
      );
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'A short reason is required' },
        { status: 400 },
      );
    }

    const loan = await db.loanApplicants.findUnique({
      where: { id: loanId },
      include: { loanOfficer: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!loan) {
      return NextResponse.json({ error: 'Loan not found' }, { status: 404 });
    }
    // v53 — IDOR fix: ownership check uses JWT-derived userId.
    if (loan.userId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: loan does not belong to authenticated customer.' },
        { status: 403 },
      );
    }
    if (loan.status !== 'running') {
      return NextResponse.json(
        { error: 'Restructuring is only available for active loans' },
        { status: 400 },
      );
    }

    // Reject if there's already a pending restructuring on this loan
    const existingPending = await db.loanRestructuring.findFirst({
      where: { loanApplicantId: loanId, status: 'pending' },
    });
    if (existingPending) {
      return NextResponse.json(
        { error: 'A pending restructuring request already exists for this loan' },
        { status: 409 },
      );
    }

    const currentTenor = loan.finalTenure || loan.approvedTenor || loan.duration;
    const currentPayment = (Number(loan.finalAmount) || Number(loan.approvedAmount) || Number(loan.amount)) /
      Math.max(1, currentTenor);

    // v53 — atomic: create restructure record + audit log in one transaction.
    const restructuring = await db.$transaction(async (tx) => {
      const r = await tx.loanRestructuring.create({
        data: {
          loanApplicantId: loanId,
          userId,
          requestType,
          currentTenor,
          requestedTenor: Number(requestedTenor),
          currentPayment,
          reason: reason.trim(),
          status: 'pending',
        },
      });
      await tx.auditLog.create({
        data: {
          action: 'created',
          module: 'restructure',
          description: `Customer ${userId} requested ${requestType} for loan ${loan.applicationRef}`,
          severity: 'info',
          metadata: JSON.stringify({ userId, loanId, restructuringId: r.id, authSource: 'jwt' }),
        },
      });
      return r;
    });

    // Notify the assigned Loan Officer (if any) — fire-and-forget post-commit.
    if (loan.loanOfficer) {
      void createNotification({
        adminId: loan.loanOfficer.id,
        type: 'restructure_requested',
        title: 'Loan Restructuring Request',
        message: `${loan.applicationRef}: customer requested ${requestType.replace(/_/g, ' ')} (${requestedTenor} months).`,
        category: 'loan',
        actionLabel: 'Review Request',
        actionView: 'loan-detail',
        actionParams: { loanId },
      });
    }

    // Also notify HOC for restructuring approvals
    const hocStaff = await db.admin
      .findMany({ where: { roleType: 'hoc', status: 1 }, select: { id: true } })
      .catch(() => []);
    if (hocStaff.length > 0) {
      await Promise.all(
        hocStaff.map((s) =>
          createNotification({
            adminId: s.id,
            type: 'restructure_requested',
            title: 'Loan Restructuring Request',
            message: `${loan.applicationRef}: restructuring request (${requestType}) submitted.`,
            category: 'loan',
            actionLabel: 'Review',
            actionView: 'loan-detail',
            actionParams: { loanId },
          }),
        ),
      );
    }

    return NextResponse.json({
      restructuring,
      message: 'Your restructuring request has been submitted. Your Loan Officer will review it within 48 hours.',
    });
  } catch (e: any) {
    console.error('Customer restructure POST error:', e);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// v53 — PUT removed from customer route. Admin approve/reject is now at
// /api/admin/restructure/[id] with requireRole(['super','md','hoc','cro']).
