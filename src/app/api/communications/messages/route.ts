import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

export async function GET(req: NextRequest) {
  // v51 — auth gate.
  const authResult_v51 = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'communications']);
  if (authResult_v51 instanceof NextResponse) return authResult_v51;
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
