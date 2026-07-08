import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';

const PERM_FLAGS = [
  'loanOrigination', 'loanVetting', 'loanStructuring', 'loanAnalyst',
  'loanRisk', 'loanLegal', 'loanCfoReview', 'loanFinalization',
  'loanDisbursement', 'loanPortfolio', 'loanSupervisor', 'loanMcc',
  'onboarding', 'kycVerify', 'accountingView', 'accountingPost',
  'treasuryOnboard', 'treasuryBook', 'treasuryAssets', 'branchManage',
  'auditAccess', 'internalControl', 'compliance', 'reportsGlobal',
  'generalSettings', 'message', 'support',
];

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = await db.admin.findUnique({
      where: { id },
      select: {
        id: true, firstName: true, lastName: true, username: true, email: true,
        phone: true, role: true, roleType: true, status: true, branchId: true,
        avatar: true, lastLogin: true, lastLoginIp: true, createdAt: true,
        branch: { select: { id: true, name: true, code: true } },
        ...Object.fromEntries(PERM_FLAGS.map((f) => [f, true])),
      },
    });
    if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ admin });
  } catch (e: any) {
    console.error('Get staff API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.admin.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data: any = {};
    for (const k of ['firstName', 'lastName', 'username', 'email', 'phone', 'role', 'roleType', 'status', 'branchId', 'avatar']) {
      if (k in body) data[k] = body[k];
    }
    for (const f of PERM_FLAGS) {
      if (f in body) data[f] = !!body[f];
    }

    const admin = await db.admin.update({ where: { id }, data });
    return NextResponse.json({ admin: { ...admin, password: undefined } });
  } catch (e: any) {
    console.error('Update staff API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// Reset password
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const newPwd = body.password || 'Password@123';
    const hashed = await bcrypt.hash(newPwd, 10);
    await db.admin.update({ where: { id }, data: { password: hashed } });
    return NextResponse.json({ ok: true, tempPassword: newPwd });
  } catch (e: any) {
    console.error('Reset password API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
