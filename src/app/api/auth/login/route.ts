import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { signAuthToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    // Trim the username to avoid whitespace issues
    const cleanUsername = String(username).trim();

    const admin = await db.admin.findUnique({
      where: { username: cleanUsername },
      include: { branch: true },
    });

    // Generic error to prevent user enumeration
    if (!admin) {
      console.log(`[LOGIN] Failed: username "${cleanUsername}" not found`);
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // Verify password with bcrypt
    let valid = false;
    try {
      valid = await bcrypt.compare(String(password), admin.password);
    } catch (pwdErr) {
      console.error('[LOGIN] bcrypt.compare error:', pwdErr);
      valid = false;
    }

    if (!valid) {
      console.log(`[LOGIN] Failed: wrong password for "${cleanUsername}"`);
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (admin.status !== 1) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    // v24 — Maintenance mode: block non-superadmin logins
    if (admin.role !== 'super') {
      try {
        const maintenanceSetting = await db.systemSetting.findUnique({
          where: { key: 'maintenance_mode' },
        });
        if (maintenanceSetting?.value === 'true') {
          const msgSetting = await db.systemSetting.findUnique({
            where: { key: 'maintenance_message' },
          });
          return NextResponse.json(
            { error: msgSetting?.value || 'System is under maintenance. Please try again later.' },
            { status: 503 }
          );
        }
      } catch (maintErr) {
        // If SystemSetting table doesn't exist, skip maintenance check
        console.error('[LOGIN] Maintenance check skipped:', maintErr);
      }
    }

    // Capture IP + User-Agent
    const ip = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined;
    const userAgent = req.headers.get('user-agent') || undefined;

    // Update last login (non-blocking, errors don't break login)
    try {
      await db.admin.update({
        where: { id: admin.id },
        data: { lastLogin: new Date(), lastLoginIp: ip },
      });
    } catch (updateErr) {
      console.error('[LOGIN] Failed to update lastLogin (non-blocking):', updateErr);
    }

    // Issue JWT token
    const token = signAuthToken({
      id: admin.id,
      role: admin.role,
      branchId: admin.branchId,
    });

    // v25 — Track active session (wrapped in try/catch, NOT .catch on undefined)
    try {
      const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000); // 8 hours
      await db.activeSession.create({
        data: {
          adminId: admin.id,
          tokenHash,
          ip,
          userAgent,
          expiresAt,
        },
      });
    } catch (sessionErr) {
      // If ActiveSession table doesn't exist or Prisma Client wasn't regenerated,
      // this will fail — but login should still succeed
      console.error('[LOGIN] ActiveSession write failed (non-blocking):', sessionErr);
    }

    // Log login history (also wrapped in try/catch)
    try {
      await db.loginHistory.create({
        data: {
          adminId: admin.id,
          guard: 'admin',
          status: 'success',
          ipAddress: ip,
          userAgent,
        },
      });
    } catch (historyErr) {
      console.error('[LOGIN] LoginHistory write failed (non-blocking):', historyErr);
    }

    console.log(`[LOGIN] Success: "${cleanUsername}" (role: ${admin.role})`);

    const { password: _pw, ...safeAdmin } = admin;
    return NextResponse.json({ admin: safeAdmin, token });
  } catch (e: any) {
    console.error('[LOGIN] FATAL error:', e);
    return NextResponse.json(
      { error: 'Login failed: ' + (e.message || 'Unknown error') },
      { status: 500 }
    );
  }
}
