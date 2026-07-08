import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

/**
 * GET /api/notifications?userId=&adminId=&unreadOnly=&page=&limit=
 * Returns notifications for the user/admin, paginated, with unread count.
 *
 * POST /api/notifications
 * Body: { userId?, adminId?, type, title, message, category?, actionLabel?,
 *         actionView?, actionParams?, metadata? }
 * Persists a notification, broadcasts via WebSocket.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId') || undefined;
    const adminId = searchParams.get('adminId') || undefined;
    const unreadOnly = searchParams.get('unreadOnly') === 'true' || searchParams.get('unreadOnly') === '1';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10) || 20));

    if (!userId && !adminId) {
      return NextResponse.json({ error: 'userId or adminId required' }, { status: 400 });
    }

    const where: any = {};
    if (userId) where.userId = userId;
    if (adminId) where.adminId = adminId;
    if (unreadOnly) where.isRead = false;

    const [items, total, unreadCount] = await Promise.all([
      db.notification.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      db.notification.count({ where }),
      db.notification.count({ where: { ...where, isRead: false } }),
    ]);

    return NextResponse.json({
      items,
      total,
      unreadCount,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e: any) {
    console.error('[api/notifications] GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      userId,
      adminId,
      type,
      title,
      message,
      category,
      actionLabel,
      actionView,
      actionParams,
      metadata,
    } = body as {
      userId?: string;
      adminId?: string;
      type: string;
      title: string;
      message: string;
      category?: string;
      actionLabel?: string;
      actionView?: string;
      actionParams?: Record<string, unknown>;
      metadata?: Record<string, unknown>;
    };

    if (!type || !title || !message) {
      return NextResponse.json({ error: 'type, title, message required' }, { status: 400 });
    }
    if (!userId && !adminId) {
      return NextResponse.json({ error: 'userId or adminId required' }, { status: 400 });
    }

    const created = await createNotification({
      userId: userId || null,
      adminId: adminId || null,
      type,
      title,
      message,
      category,
      actionLabel: actionLabel || null,
      actionView: actionView || null,
      actionParams: actionParams || null,
      metadata: metadata || null,
    });

    if (!created) {
      return NextResponse.json({ error: 'failed to create notification' }, { status: 500 });
    }
    return NextResponse.json({ success: true, notification: created });
  } catch (e: any) {
    console.error('[api/notifications] POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
