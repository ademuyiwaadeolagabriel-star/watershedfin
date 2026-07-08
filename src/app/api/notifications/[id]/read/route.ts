import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * POST /api/notifications/[id]/read
 * Marks a single notification as read, sets readAt = now().
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const existing = await db.notification.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Notification not found' }, { status: 404 });
    }

    if (!existing.isRead) {
      await db.notification.update({
        where: { id },
        data: { isRead: true, readAt: new Date() },
      });
    }

    return NextResponse.json({ success: true, id });
  } catch (e: any) {
    console.error('[api/notifications/[id]/read] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
