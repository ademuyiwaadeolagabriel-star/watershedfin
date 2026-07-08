import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET() {
  try {
    const tickets = await db.ticket.findMany({
      include: { user: { select: { firstName: true, lastName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    return NextResponse.json({
      messages: tickets.map(t => ({
        id: t.id,
        customerName: `${t.user?.firstName || ''} ${t.user?.lastName || ''}`.trim() || 'Unknown',
        subject: t.subject,
        body: t.message,
        read: t.status === 'closed',
        createdAt: t.createdAt,
      })),
    });
  } catch (e: any) {
    return NextResponse.json({ messages: [] });
  }
}
