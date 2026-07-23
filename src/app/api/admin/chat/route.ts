import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createNotification } from '@/lib/notifications';

// ============================================================================
// /api/admin/chat
// GET  ?adminId=          — returns all chat conversations for this admin
// POST { adminId, userId, message } — admin replies to a customer thread
// ============================================================================

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const adminId = url.searchParams.get('adminId');
    if (!adminId) {
      return NextResponse.json({ error: 'adminId is required' }, { status: 400 });
    }

    // All messages where the admin is the staff side
    const allMessages = await db.chatMessage.findMany({
      where: {
        OR: [
          { adminId, senderType: 'staff' },
          // Customer messages that belong to this admin's customers
          { adminId, senderType: 'customer' },
        ],
      },
      orderBy: { createdAt: 'asc' },
    });

    // Group messages by userId to build conversation list
    const convMap = new Map<string, any>();
    for (const m of allMessages) {
      const key = m.userId || 'unknown';
      if (!convMap.has(key)) {
        convMap.set(key, {
          userId: key,
          messages: [],
          lastMessageAt: m.createdAt,
          unreadCount: 0,
        });
      }
      const conv = convMap.get(key);
      conv.messages.push(m);
      if (new Date(m.createdAt) > new Date(conv.lastMessageAt)) {
        conv.lastMessageAt = m.createdAt;
      }
      if (m.senderType === 'customer' && !m.isRead) {
        conv.unreadCount += 1;
      }
    }

    // Enrich with user details
    const userIds = Array.from(convMap.keys()).filter((id) => id !== 'unknown');
    const users = await db.user
      .findMany({
        where: { id: { in: userIds } },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          accountNumber: true,
          phone: true,
          business: { select: { name: true } },
        },
      })
      .catch(() => []);
    const userMap = new Map<string, any>(users.map((u: any) => [u.id, u] as [string, any]));

    const conversations = Array.from(convMap.values())
      .map((c) => {
        const user = userMap.get(c.userId);
        const lastMsg = c.messages[c.messages.length - 1];
        return {
          userId: c.userId,
          user: user || null,
          lastMessage: lastMsg?.message || '',
          lastMessageAt: c.lastMessageAt,
          unreadCount: c.unreadCount,
          totalMessages: c.messages.length,
          messages: c.messages,
        };
      })
      .sort((a, b) => new Date(b.lastMessageAt).getTime() - new Date(a.lastMessageAt).getTime());

    return NextResponse.json({ conversations });
  } catch (e: any) {
    console.error('Admin chat GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { adminId, userId, message } = await req.json();

    if (!adminId || !userId) {
      return NextResponse.json({ error: 'adminId and userId are required' }, { status: 400 });
    }
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'message is required' }, { status: 400 });
    }

    const msg = await db.chatMessage.create({
      data: {
        userId,
        adminId,
        senderType: 'staff',
        message: message.trim(),
        isRead: false,
      },
    });

    // Notify the customer
    await createNotification({
      userId,
      type: 'chat_message',
      title: 'New message from your Loan Officer',
      message: message.trim().slice(0, 100) + (message.length > 100 ? '…' : ''),
      category: 'system',
      actionLabel: 'Reply',
      actionView: 'customer-chat',
    });

    return NextResponse.json({ message: msg });
  } catch (e: any) {
    console.error('Admin chat POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
