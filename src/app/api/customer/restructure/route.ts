import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/customer/restructure
// POST { userId, loanId, requestType, requestedTenor, reason }
//      — customer creates a loan restructuring request
// GET  ?userId=      — customer's restructuring requests
// GET  ?adminId=     — admin view of all restructuring requests
// PUT  { id, adminId, status, adminNotes }
//      — admin approve/reject
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    const adminId = url.searchParams.get('adminId');
    const status = url.searchParams.get('status');

    if (!userId && !adminId) {
      return NextResponse.json(
        { error: 'Either userId or adminId is required' },
        { status: 400 },
      );
    }

    const where: any = {};
    if (userId) where.userId = userId;
    if (adminId) where.adminId = adminId;
    if (status && status !== 'all') where.status = status;

    const requests = await db.loanRestructuring.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with loan + user details (LoanRestructuring has no FK relations)
    const loanIds = Array.from(new Set(requests.map((r) => r.loanApplicantId).filter(Boolean))) as string[];
    const userIds = Array.from(new Set(requests.map((r) => r.userId).filter(Boolean))) as string[];

    const [loans, users] = await Promise.all([
      loanIds.length > 0
        ? db.loanApplicants
            .findMany({
              where: { id: { in: loanIds } },
              select: {
                id: true,
                applicationRef: true,
                amount: true,
                approvedAmount: true,
                duration: true,
                status: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
      userIds.length > 0
        ? db.user
            .findMany({
              where: { id: { in: userIds } },
              select: {
                id: true,
                firstName: true,
                lastName: true,
                accountNumber: true,
                phone: true,
              },
            })
            .catch(() => [])
        : Promise.resolve([]),
    ]);
    const loanMap = new Map(loans.map((l: any) => [l.id, l]));
    const userMap = new Map(users.map((u: any) => [u.id, u]));

    const enriched = requests.map((r) => ({
      ...r,
      loanApplicant: loanMap.get(r.loanApplicantId) || null,
      user: userMap.get(r.userId) || null,
    }));

    return NextResponse.json({ requests: enriched });
  } catch (e: any) {
    console.error('Restructure GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, loanId, requestType, requestedTenor, reason } = await req.json();

    if (!userId || !loanId) {
      return NextResponse.json(
        { error: 'userId and loanId are required' },
        { status: 400 },
      );
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
    if (loan.userId !== userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
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
    const currentPayment = (loan.finalAmount || loan.approvedAmount || loan.amount) /
      Math.max(1, currentTenor);

    const restructuring = await db.loanRestructuring.create({
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

    // Notify the assigned Loan Officer (if any)
    if (loan.loanOfficer) {
      await createNotification({
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

    // Also notify HOC (Head of Credit) for restructuring approvals
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

    // Audit
    await db.auditLog
      .create({
        data: {
          action: 'created',
          module: 'restructure',
          description: `Customer ${userId} requested ${requestType} for loan ${loan.applicationRef}`,
          severity: 'info',
          metadata: JSON.stringify({ userId, loanId, restructuringId: restructuring.id }),
        },
      })
      .catch(() => {});

    return NextResponse.json({
      restructuring,
      message: 'Your restructuring request has been submitted. Your Loan Officer will review it within 48 hours.',
    });
  } catch (e: any) {
    console.error('Restructure POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  try {
    const { id, adminId, status, adminNotes } = await req.json();

    if (!id || !adminId) {
      return NextResponse.json({ error: 'id and adminId are required' }, { status: 400 });
    }
    if (!status || !['approved', 'rejected'].includes(status)) {
      return NextResponse.json(
        { error: 'status must be either "approved" or "rejected"' },
        { status: 400 },
      );
    }

    const existing = await db.loanRestructuring.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Restructuring request not found' }, { status: 404 });
    }
    if (existing.status !== 'pending') {
      return NextResponse.json(
        { error: `Request already ${existing.status}` },
        { status: 400 },
      );
    }

    const updated = await db.loanRestructuring.update({
      where: { id },
      data: {
        status,
        adminId,
        adminNotes: adminNotes?.trim() || null,
      },
    });

    // If approved, apply the new tenor on the loan
    if (status === 'approved') {
      try {
        const newTenor = existing.requestedTenor;
        // Recompute maturity from the disbursement/start date if available;
        // otherwise fall back to "now + newTenor months".
        const loan = await db.loanApplicants.findUnique({
          where: { id: existing.loanApplicantId },
          select: { startDate: true, disbursedAt: true },
        });
        const baseDate = loan?.startDate || loan?.disbursedAt || new Date();
        const newMaturity = new Date(baseDate);
        newMaturity.setMonth(newMaturity.getMonth() + newTenor);

        await db.loanApplicants.update({
          where: { id: existing.loanApplicantId },
          data: {
            finalTenure: newTenor,
            maturityDate: newMaturity,
          },
        });
      } catch (e: any) {
        console.error('Failed to apply restructure to loan:', e);
      }
    }

    // Notify the customer
    await createNotification({
      userId: existing.userId,
      type: 'restructure_decision',
      title: `Restructuring ${status === 'approved' ? 'Approved' : 'Rejected'}`,
      message:
        status === 'approved'
          ? `Your loan restructuring request has been approved. New tenor: ${existing.requestedTenor} months. ${adminNotes ? `Notes: ${adminNotes}` : ''}`
          : `Your loan restructuring request was rejected. ${adminNotes ? `Reason: ${adminNotes}` : 'Please contact your Loan Officer for more details.'}`,
      category: 'loan',
      actionLabel: 'View Loan',
      actionView: 'customer-loan-breakdown',
      actionParams: { loanId: existing.loanApplicantId },
    });

    // Audit
    await db.auditLog
      .create({
        data: {
          action: status === 'approved' ? 'approved' : 'rejected',
          module: 'restructure',
          description: `Admin ${adminId} ${status} restructuring request ${id}`,
          severity: status === 'approved' ? 'info' : 'warning',
          metadata: JSON.stringify({ adminId, restructuringId: id, status }),
        },
      })
      .catch(() => {});

    return NextResponse.json({ restructuring: updated });
  } catch (e: any) {
    console.error('Restructure PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
