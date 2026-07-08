import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ============================================================================
// POST /api/customer/tickets/[id]/reply
// Body: { userId, message }
// Adds a customer reply to the ticket. Ticket status reverts to 'open' if it
// was 'pending' (i.e. waiting on customer).
// ============================================================================

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    const { userId, message } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const ticket = await db.ticket.findUnique({ where: { id } });
    if (!ticket) {
      return NextResponse.json({ error: 'Ticket not found' }, { status: 404 });
    }
    if (ticket.userId !== userId) {
      return NextResponse.json(
        { error: 'You do not have permission to reply to this ticket' },
        { status: 403 },
      );
    }
    if (ticket.status === 'closed') {
      return NextResponse.json(
        { error: 'This ticket is closed. Please open a new ticket if you need further assistance.' },
        { status: 400 },
      );
    }

    const reply = await db.reply.create({
      data: {
        ticketId: id,
        userId,
        adminId: null,
        message: message.trim(),
        isStaff: false,
      },
    });

    // Re-open ticket if it was pending on the customer
    if (ticket.status === 'pending') {
      await db.ticket.update({
        where: { id },
        data: { status: 'open' },
      });
    }

    return NextResponse.json({
      reply,
      message: 'Your reply has been sent.',
    });
  } catch (e: any) {
    console.error('Ticket reply error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
