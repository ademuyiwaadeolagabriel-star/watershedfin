import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '@/lib/auth';

// POST /api/customer/login
// Body: { identifier, password }
//   identifier = email OR phone
//   password   = plaintext (bcrypt-verified against stored hash)
// Returns: { user: { ...user, password: undefined }, token } on success
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const identifier = (body.identifier || '').toString().trim().toLowerCase();
    const password = (body.password || '').toString();

    if (!identifier) {
      return NextResponse.json(
        { error: 'Please enter your email address or phone number.' },
        { status: 400 }
      );
    }
    if (!password) {
      return NextResponse.json(
        { error: 'Please enter your password.' },
        { status: 401 }
      );
    }

    // Find the customer by email OR phone
    const user = await db.user.findFirst({
      where: {
        OR: [
          { email: identifier },
          { phone: identifier },
          { phone: body.identifier?.trim() },
        ],
      },
      include: {
        business: true,
        branch: true,
      },
    });

    // A3 FIX: Generic error to prevent user enumeration
    if (!user) {
      return NextResponse.json(
        { error: 'Invalid email/phone or password.' },
        { status: 401 }
      );
    }

    // A3 FIX: Removed 'customer123' hardcoded password — bcrypt-only authentication
    let valid = false;
    if (user.password) {
      try {
        valid = await bcrypt.compare(password, user.password);
      } catch {
        valid = false;
      }
    }

    if (!valid) {
      return NextResponse.json(
        { error: 'Invalid email/phone or password.' },
        { status: 401 }
      );
    }

    // v24 — Maintenance mode: block customer logins
    const maintenanceSetting = await db.systemSetting.findUnique({
      where: { key: 'maintenance_mode' },
    }).catch(() => null);
    if (maintenanceSetting?.value === 'true') {
      const msgSetting = await db.systemSetting.findUnique({
        where: { key: 'maintenance_message' },
      }).catch(() => null);
      return NextResponse.json(
        { error: msgSetting?.value || 'System is under maintenance. Please try again later.' },
        { status: 503 }
      );
    }

    // Update lastLogin timestamp
    await db.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } }).catch(() => {});

    // Issue JWT token
    const token = signAuthToken({
      id: user.id,
      role: 'customer',
      branchId: user.branchId,
    });

    // Strip password before returning
    const { password: _pwd, ...safeUser } = user;
    void _pwd;
    return NextResponse.json({ user: safeUser, token });
  } catch (e: any) {
    console.error('Customer login API error:', e);
    return NextResponse.json(
      { error: 'Could not sign you in. Please try again later.' },
      { status: 500 }
    );
  }
}
