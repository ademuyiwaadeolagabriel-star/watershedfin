import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// /api/customer/tickets
// GET  ?userId=     — returns the customer's tickets (with replies)
// POST { userId, subject, message } — creates a ticket with refId TKT-YYYY-NNNN
// ============================================================================

async function nextTicketRef(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TKT-${year}-`;
  // Find the highest existing sequence number for the year
  const existing = await db.ticket.findMany({
    where: { refId: { startsWith: prefix } },
    select: { refId: true },
  });
  let max = 0;
  for (const t of existing) {
    const n = parseInt(t.refId!.slice(prefix.length), 10);
    if (!isNaN(n) && n > max) max = n;
  }
  return `${prefix}${String(max + 1).padStart(4, '0')}`;
}

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId query parameter is required' }, { status: 400 });
    }

    const tickets = await db.ticket.findMany({
      where: { userId },
      include: {
        replies: {
          orderBy: { createdAt: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (e: any) {
    console.error('Tickets list error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, subject, message } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!subject || !subject.trim()) {
      return NextResponse.json({ error: 'subject is required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({ where: { id: userId } });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const refId = await nextTicketRef();
    const ticket = await db.ticket.create({
      data: {
        userId,
        subject: subject.trim(),
        message: message.trim(),
        status: 'open',
        priority: 'normal',
        refId,
      },
      include: { replies: true },
    });

    return NextResponse.json({
      ticket,
      message: `Ticket ${refId} opened. Our support team will respond shortly.`,
    });
  } catch (e: any) {
    console.error('Ticket create error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
