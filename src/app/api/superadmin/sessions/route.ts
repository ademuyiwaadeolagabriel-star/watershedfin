import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;

  const sessions = await db.activeSession.findMany({
    where: { revokedAt: null, expiresAt: { gt: new Date() } },
    include: {
      admin: {
        select: { id: true, firstName: true, lastName: true, username: true, email: true, role: true, branchId: true },
      },
    },
    orderBy: { lastSeen: 'desc' },
  });

  return NextResponse.json({
    sessions: sessions.map((s) => ({
      id: s.id,
      adminId: s.adminId,
      admin: s.admin,
      ip: s.ip,
      userAgent: s.userAgent,
      lastSeen: s.lastSeen,
      expiresAt: s.expiresAt,
      createdAt: s.createdAt,
    })),
    count: sessions.length,
  });
}

// Force logout — revoke one session (or all sessions for an admin)
export async function DELETE(req: NextRequest) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { searchParams } = new URL(req.url);
    const sessionId = searchParams.get('sessionId');
    const adminId = searchParams.get('adminId');

    let count = 0;
    if (sessionId) {
      const result = await db.activeSession.updateMany({
        where: { id: sessionId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      count = result.count;
    } else if (adminId) {
      const result = await db.activeSession.updateMany({
        where: { adminId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      count = result.count;
    } else {
      return NextResponse.json({ error: 'sessionId or adminId required' }, { status: 400 });
    }

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'session_force_revoke',
        description: `Revoked ${count} session(s) for ${adminId ? `admin ${adminId}` : `session ${sessionId}`}`,
        module: 'superadmin',
        severity: 'warning',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ revoked: count });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
