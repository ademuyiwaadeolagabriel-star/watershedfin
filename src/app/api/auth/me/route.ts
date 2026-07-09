import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/auth/me
 * Returns the current authenticated admin's profile (using JWT token)
 */
export async function GET(req: NextRequest) {
  try {
    const payload = getAuthFromRequest(req);
    if (!payload) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const admin = await db.admin.findUnique({
      where: { id: payload.id },
      include: { branch: true },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Admin not found' }, { status: 404 });
    }

    // Strip password
    const { password: _pw, ...safeAdmin } = admin;
    return NextResponse.json({ admin: safeAdmin });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
