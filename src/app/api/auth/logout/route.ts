import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

import { extractToken, verifyAuthToken } from '@/lib/auth';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const token = extractToken(req);

    if (!token) {
      return NextResponse.json({ ok: true });
    }

    const payload = await verifyAuthToken(token);

    if (!payload) {
      return NextResponse.json({ ok: true });
    }

    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    if (payload.type === 'customer') {
      // Customer JWTs are revoked by advancing the server-side authVersion.
      // This immediately invalidates every previously issued customer token.
      await db.user.updateMany({
        where: {
          id: payload.id,
        },
        data: {
          authVersion: {
            increment: 1,
          },
        },
      });

      return NextResponse.json({ ok: true });
    }

    // Admin/staff JWTs are revoked by marking the matching active session
    // as revoked. The session is bound to the authenticated admin ID and
    // token hash, so the caller cannot revoke another user's session.
    await db.activeSession.updateMany({
      where: {
        tokenHash,
        adminId: payload.id,
        revokedAt: null,
      },
      data: {
        revokedAt: new Date(),
      },
    });

    return NextResponse.json({ ok: true });
  } catch {
    // Logout is intentionally idempotent. The client should still clear
    // its local authentication state even if the server-side revocation
    // operation encounters an error.
    return NextResponse.json({ ok: true });
  }
}
