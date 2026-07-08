import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/notifications/read-all
 * Body: { userId? OR adminId? }
 * Marks all notifications for the given recipient as read.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { userId, adminId } = body as { userId?: string; adminId?: string };

    if (!userId && !adminId) {
      return NextResponse.json({ error: 'userId or adminId required' }, { status: 400 });
    }

    const where: any = { isRead: false };
    if (userId) where.userId = userId;
    if (adminId) where.adminId = adminId;

    const result = await db.notification.updateMany({
      where,
      data: { isRead: true, readAt: new Date() },
    });

    return NextResponse.json({ success: true, updated: result.count });
  } catch (e: any) {
    console.error('[api/notifications/read-all] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
