import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// /api/admin/tickets
// GET  ?status=  — returns all tickets (optionally filtered by status)
// POST { adminId, ticketId, message } — staff reply to a ticket
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    const where = status && status !== 'all' ? { status } : {};
    const tickets = await db.ticket.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            email: true,
            phone: true,
            accountNumber: true,
          },
        },
        replies: { orderBy: { createdAt: 'asc' } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ tickets });
  } catch (e: any) {
    console.error('Admin tickets list error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { adminId, ticketId, message } = await req.json();

    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }
    if (!ticketId) {
      return NextResponse.json({ error: 'ticketId is required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({ where: { id: adminId } });
    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    const ticket = await db.ticket.findUnique({ where: { id: ticketId } });
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }

    const reply = await db.reply.create({
      data: {
        ticketId,
        userId: null,
        adminId,
        message: message.trim(),
        isStaff: true,
      },
    });

    // Mark ticket as 'pending' (waiting on customer)
    if (ticket.status !== 'closed') {
      await db.ticket.update({
        where: { id: ticketId },
        data: { status: 'pending' },
      });
    }

    // Audit log
    await db.auditLog.create({
      data: {
        action: 'updated',
        module: 'ticket',
        description: `Staff ${admin.firstName} ${admin.lastName} replied to ticket ${ticket.refId || ticketId}`,
        severity: 'info',
        metadata: JSON.stringify({ ticketId, adminId, replyId: reply.id }),
      },
    });

    return NextResponse.json({
      reply,
      message: 'Reply sent to customer.',
    });
  } catch (e: any) {
    console.error('Admin ticket reply error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
