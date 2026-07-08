import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
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
