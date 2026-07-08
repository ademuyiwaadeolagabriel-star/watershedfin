import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const announcements = await db.notification.findMany({
      where: { type: 'announcement' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({
      announcements: announcements.map(a => ({
        id: a.id,
        title: a.title,
        body: a.message,
        audience: 'all',
        createdAt: a.createdAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ announcements: [] });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { title, body: messageBody } = body;
    const announcement = await db.notification.create({
      data: {
        type: 'announcement',
        title: title || 'Announcement',
        message: messageBody || '',
        category: 'system',
        isRead: false,
      },
    });
    return NextResponse.json({ announcement });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
