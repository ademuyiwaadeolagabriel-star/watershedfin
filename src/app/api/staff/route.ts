import { NextRequest, NextResponse } from 'next/server';
import { requireRole } from '@/lib/auth';
import { db } from '@/lib/db';
import bcrypt from 'bcryptjs';
import { ROLE_PERMISSIONS } from '@/lib/constants';

export async function GET(req: NextRequest) {
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'md', 'hoc', 'hr', 'loan', 'lo', 'bm', 'cs']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;

  try {
    const url = new URL(req.url);
    const role = url.searchParams.get('role');
    let branchId = url.searchParams.get('branchId');
    if (['bm', 'loan', 'lo', 'cs'].includes(authResult_v53.role)) {
      if (!authResult_v53.branchId) return NextResponse.json({ error: 'Your staff account is not assigned to a branch.' }, { status: 403 });
      branchId = authResult_v53.branchId || null;
    }
    const status = url.searchParams.get('status');

    const where: any = {};
    if (role && role !== 'all') {
      // v43: Match either role OR roleType (some staff have roleType set differently)
      where.OR = [
        { role },
        { roleType: role },
      ];
    }
    if (branchId && branchId !== 'all') where.branchId = branchId;
    if (status === 'active') where.status = 1;
    if (status === 'suspended') where.status = 0;

    const staff = await db.admin.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        phone: true,
        role: true,
        roleType: true,
        status: true,
        branchId: true,
        lastLogin: true,
        lastLoginIp: true,
        avatar: true,
        createdAt: true,
        branch: { select: { id: true, name: true, code: true } },
        loanOrigination: true, loanVetting: true, loanStructuring: true, loanAnalyst: true,
        loanRisk: true, loanLegal: true, loanCfoReview: true, loanFinalization: true,
        loanDisbursement: true, loanPortfolio: true, loanSupervisor: true, loanMcc: true,
        onboarding: true, kycVerify: true, accountingView: true, accountingPost: true,
        treasuryOnboard: true, treasuryBook: true, treasuryAssets: true, branchManage: true,
        auditAccess: true, internalControl: true, compliance: true, reportsGlobal: true,
        generalSettings: true, message: true, support: true,
      },
    });

    return NextResponse.json({ staff });
  } catch (e: any) {
    console.error('List staff API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  // v53 — auth gate: least-privilege role check.
  const authResult_v53 = await requireRole(req, ['super', 'hr']);
  if (authResult_v53 instanceof NextResponse) return authResult_v53;
  const creator = authResult_v53 as { id: string; role: string; branchId?: string | null };

  try {
    const body = await req.json();
    if (!body.firstName || !body.lastName || !body.username || !body.email || !body.password) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }
    const exists = await db.admin.findFirst({
      where: { OR: [{ username: body.username }, { email: body.email }] },
    });
    if (exists) {
      return NextResponse.json({ error: 'Username or email already exists' }, { status: 400 });
    }

    const hashed = await bcrypt.hash(body.password, 10);
    const allowedRoles = ['admin', 'cs', 'compliance', 'credit', 'loan', 'lo', 'bm', 'frontdesk', 'treasury', 'analyst', 'cfo', 'legal', 'hoc', 'cro', 'md'];
    const role = String(body.role || 'admin');
    if (!allowedRoles.includes(role) || (role === 'super' && creator.role !== 'super')) {
      return NextResponse.json({ error: 'Invalid or unauthorized staff role.' }, { status: 403 });
    }
    const perms = ROLE_PERMISSIONS[role] || [];

    // Build permission data — if role gets wildcard, leave all flags false (checked at runtime)
    const permData: any = {};
    const flags = [
      'loanOrigination', 'loanVetting', 'loanStructuring', 'loanAnalyst',
      'loanRisk', 'loanLegal', 'loanCfoReview', 'loanFinalization',
      'loanDisbursement', 'loanPortfolio', 'loanSupervisor', 'loanMcc',
      'onboarding', 'kycVerify', 'accountingView', 'accountingPost',
      'treasuryOnboard', 'treasuryBook', 'treasuryAssets', 'branchManage',
      'auditAccess', 'internalControl', 'compliance', 'reportsGlobal',
      'generalSettings', 'message', 'support',
      // v26 — Customer Service + Legal dual role toggles
      'csKycVerify', 'csPaymentVerify', 'legalCacSearch', 'legalMcc',
    ];
    for (const f of flags) {
      permData[f] = perms.includes('*') || perms.includes(f);
    }

    if (creator.role !== 'super' && body.branchId && creator.branchId && body.branchId !== creator.branchId) {
      return NextResponse.json({ error: 'HR can only create staff for their own branch.' }, { status: 403 });
    }

    const admin = await db.admin.create({
      data: {
        firstName: body.firstName,
        lastName: body.lastName,
        username: body.username,
        email: body.email,
        password: hashed,
        phone: body.phone || null,
        role,
        roleType: body.roleType || role,
        branchId: body.branchId || null,
        status: body.status !== undefined ? body.status : 1,
        ...permData,
      },
    });

    return NextResponse.json({ admin: { ...admin, password: undefined } });
  } catch (e: any) {
    console.error('Create staff API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
