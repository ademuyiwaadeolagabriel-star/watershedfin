import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/customer/callback
// POST { userId, preferredTime, reason } — customer requests a callback
// GET  ?userId=                     — customer's callback history
// GET  ?adminId=&status=            — admin view of all callback requests
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

    const callbacks = await db.callbackRequest.findMany({
      where,
      orderBy: { createdAt: 'desc' },
    });

    // Enrich with user details (CallbackRequest has no FK relation to User)
    const userIds = Array.from(new Set(callbacks.map((c) => c.userId).filter(Boolean))) as string[];
    const users = userIds.length > 0
      ? await db.user
          .findMany({
            where: { id: { in: userIds } },
            select: {
              id: true,
              firstName: true,
              lastName: true,
              phone: true,
              accountNumber: true,
              business: { select: { name: true } },
            },
          })
          .catch(() => [])
      : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const enriched = callbacks.map((c) => ({
      ...c,
      user: userMap.get(c.userId) || null,
    }));

    return NextResponse.json({ callbacks: enriched });
  } catch (e: any) {
    console.error('Callback GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, preferredTime, reason } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!preferredTime || !preferredTime.trim()) {
      return NextResponse.json(
        { error: 'preferredTime is required' },
        { status: 400 },
      );
    }
    if (!reason || !reason.trim()) {
      return NextResponse.json(
        { error: 'A short reason is required' },
        { status: 400 },
      );
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      include: { loanOfficer: { select: { id: true, firstName: true, lastName: true } } },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const callback = await db.callbackRequest.create({
      data: {
        userId,
        preferredTime: preferredTime.trim(),
        reason: reason.trim(),
        status: 'pending',
      },
    });

    // Notify their assigned Loan Officer (if any)
    if (user.loanOfficer) {
      await createNotification({
        adminId: user.loanOfficer.id,
        type: 'callback_requested',
        title: 'Callback Request',
        message: `${user.firstName} ${user.lastName} requested a callback at ${preferredTime}. Reason: ${reason.slice(0, 80)}`,
        category: 'system',
        actionLabel: 'View Request',
        actionView: 'customer-detail',
        actionParams: { userId },
      });
    }

    // Also notify all front-desk staff (best-effort)
    const frontDeskStaff = await db.admin
      .findMany({ where: { roleType: 'frontdesk', status: 1 }, select: { id: true } })
      .catch(() => []);
    if (frontDeskStaff.length > 0 && (!user.loanOfficer || frontDeskStaff.length > 0)) {
      await Promise.all(
        frontDeskStaff.map((s) =>
          createNotification({
            adminId: s.id,
            type: 'callback_requested',
            title: 'Callback Request',
            message: `${user.firstName} ${user.lastName} requested a callback at ${preferredTime}.`,
            category: 'system',
            actionLabel: 'View Request',
          }),
        ),
      );
    }

    // Audit log
    await db.auditLog
      .create({
        data: {
          action: 'created',
          module: 'callback',
          description: `Customer ${userId} requested a callback at ${preferredTime}`,
          severity: 'info',
          metadata: JSON.stringify({ userId, callbackId: callback.id }),
        },
      })
      .catch(() => {});

    return NextResponse.json({
      callback,
      message: 'Your callback request has been submitted. Our team will reach out shortly.',
    });
  } catch (e: any) {
    console.error('Callback POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
