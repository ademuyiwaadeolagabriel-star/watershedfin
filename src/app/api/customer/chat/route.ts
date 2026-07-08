import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/customer/chat
// GET  ?userId=   — returns chat messages between customer and their Loan Officer
// POST { userId, message } — customer sends a message; notifies their Loan Officer
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const userId = url.searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Determine the customer's assigned Loan Officer
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffId: true,
        loanOfficer: { select: { id: true, firstName: true, lastName: true, phone: true, email: true } },
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Find messages where this user is the customer party
    const messages = await db.chatMessage.findMany({
      where: {
        OR: [
          { userId, senderType: 'customer' },
          { userId, senderType: 'staff' },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    // Mark all staff-sent messages as read (customer just opened the thread)
    await db.chatMessage
      .updateMany({
        where: { userId, senderType: 'staff', isRead: false },
        data: { isRead: true, readAt: new Date() },
      })
      .catch(() => {});

    return NextResponse.json({
      messages,
      loanOfficer: user.loanOfficer
        ? {
            id: user.loanOfficer.id,
            firstName: user.loanOfficer.firstName,
            lastName: user.loanOfficer.lastName,
            phone: user.loanOfficer.phone,
            email: user.loanOfficer.email,
          }
        : null,
      customer: {
        id: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
      },
    });
  } catch (e: any) {
    console.error('Customer chat GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { userId, message } = await req.json();

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        staffId: true,
        loanOfficer: { select: { id: true, firstName: true, lastName: true } },
      },
    });
    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    const msg = await db.chatMessage.create({
      data: {
        userId,
        adminId: user.staffId || null,
        senderType: 'customer',
        message: message.trim(),
      },
    });

    // Notify the assigned Loan Officer (if any)
    if (user.loanOfficer) {
      await createNotification({
        adminId: user.loanOfficer.id,
        type: 'chat_message',
        title: `New message from ${user.firstName} ${user.lastName}`,
        message: message.trim().slice(0, 100) + (message.length > 100 ? '…' : ''),
        category: 'system',
        actionLabel: 'Reply',
        actionView: 'admin-chat',
        actionParams: { userId },
      });
    }

    return NextResponse.json({ message: msg });
  } catch (e: any) {
    console.error('Customer chat POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
