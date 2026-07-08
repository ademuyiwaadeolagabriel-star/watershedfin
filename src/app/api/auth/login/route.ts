import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { signAuthToken } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json();
    if (!username || !password) {
      return NextResponse.json({ error: 'Username and password required' }, { status: 400 });
    }

    const admin = await db.admin.findUnique({
      where: { username },
      include: { branch: true },
    });

    // A2 FIX: No backdoor — always return generic error to prevent user enumeration
    if (!admin) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    // A2 FIX: Removed password123 backdoor — bcrypt-only authentication
    let valid = false;
    try {
      valid = await bcrypt.compare(password, admin.password);
    } catch {
      valid = false;
    }

    if (!valid) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    if (admin.status !== 1) {
      return NextResponse.json({ error: 'Account suspended' }, { status: 403 });
    }

    // Update last login
    await db.admin.update({
      where: { id: admin.id },
      data: { lastLogin: new Date() },
    }).catch(() => {});

    // A1 FIX: Issue JWT token for API authentication
    const token = signAuthToken({
      id: admin.id,
      role: admin.role,
      branchId: admin.branchId,
    });

    const { password: _pw, ...safeAdmin } = admin;
    return NextResponse.json({ admin: safeAdmin, token });
  } catch (e: any) {
    console.error('Login error:', e);
    return NextResponse.json({ error: 'Login failed' }, { status: 500 });
  }
}
