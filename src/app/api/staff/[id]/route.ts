import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';

const PERM_FLAGS = [
  'loanOrigination', 'loanVetting', 'loanStructuring', 'loanAnalyst',
  'loanRisk', 'loanLegal', 'loanCfoReview', 'loanFinalization',
  'loanDisbursement', 'loanPortfolio', 'loanSupervisor', 'loanMcc',
  'onboarding', 'kycVerify', 'accountingView', 'accountingPost',
  'treasuryOnboard', 'treasuryBook', 'treasuryAssets', 'branchManage',
  'auditAccess', 'internalControl', 'compliance', 'reportsGlobal',
  'generalSettings', 'message', 'support',
];

export async function GET(req : NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'hr']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

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
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'hr']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.admin.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const data: any = {};
    const actor = authResult_v53 as { id: string; role: string; branchId?: string | null };
    if (body.role !== undefined) {
      const allowedRoles = ['admin', 'cs', 'compliance', 'credit', 'loan', 'lo', 'bm', 'frontdesk', 'treasury', 'analyst', 'cfo', 'legal', 'hoc', 'cro', 'md'];
      if (!allowedRoles.includes(String(body.role)) || (String(body.role) === 'super' && actor.role !== 'super')) {
        return NextResponse.json({ error: 'Invalid or unauthorized staff role.' }, { status: 403 });
      }
    }
    for (const k of ['firstName', 'lastName', 'username', 'email', 'phone', 'role', 'roleType', 'status', 'branchId', 'avatar']) {
      if (k in body) data[k] = body[k];
    }
    if (actor.role === 'super') {
      for (const f of PERM_FLAGS) {
        if (f in body) data[f] = !!body[f];
      }
    } else if (body.role !== undefined) {
      // HR cannot grant arbitrary permissions; role defaults are authoritative.
      const rolePerms = (await import('@/lib/constants')).ROLE_PERMISSIONS[String(body.role)] || [];
      for (const f of PERM_FLAGS) data[f] = rolePerms.includes('*') || rolePerms.includes(f);
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
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'hr']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const newPwd = typeof body.password === 'string' && body.password.length >= 8
      ? body.password
      : crypto.randomBytes(9).toString('base64url').slice(0, 12);
    const hashed = await bcrypt.hash(newPwd, 10);
    await db.admin.update({
      where: { id },
      data: { password: hashed, passwordChangedAt: new Date(), mustChangePassword: true },
    });
    await db.activeSession.updateMany({
      where: { adminId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    return NextResponse.json({ ok: true, tempPassword: newPwd });
  } catch (e: any) {
    console.error('Reset password API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
