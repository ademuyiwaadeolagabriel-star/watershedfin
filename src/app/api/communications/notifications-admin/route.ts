import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // v51 — auth gate.
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'communications']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
  try {
    const notifications = await db.notification.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return NextResponse.json({
      notifications: notifications.map(n => ({
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.message,
        read: n.isRead,
        recipientName: n.userId || n.adminId || 'All',
        createdAt: n.createdAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ notifications: [] });
  }
}
