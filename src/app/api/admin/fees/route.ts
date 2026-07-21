import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

/**
 * GET /api/admin/fees
 * List all fees (SystemSetting rows with category='fees')
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'md', 'cfo', 'admin']);
  if (auth instanceof NextResponse) return auth;

  try {
    const fees = await db.systemSetting.findMany({
      where: { category: 'fees' },
      orderBy: { key: 'asc' },
    });

    return NextResponse.json({
      fees: fees.map(f => ({
        id: f.id,
        key: f.key,
        value: f.value,
        type: f.type,
        label: (f as any).label || f.key,
        active: (f as any).active !== false,
        updatedAt: f.updatedAt,
        updatedBy: f.updatedBy,
      })),
    });
  } catch (e: any) {
    console.error('[FEES] GET error:', e);
    return NextResponse.json(
      { error: 'Failed to load fees. Run: npx prisma db push', details: e.message },
      { status: 500 }
    );
  }
}

/**
 * POST /api/admin/fees
 * Create a new fee
 * Body: { key, label, amount, active? }
 */
export async function POST(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'cfo']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const body = await req.json();
    const { key, label, amount, active } = body;

    if (!key || !label || amount === undefined) {
      return NextResponse.json({ error: 'key, label, and amount are required' }, { status: 400 });
    }

    const existing = await db.systemSetting.findUnique({ where: { key } });
    if (existing) {
      return NextResponse.json({ error: `Fee with key "${key}" already exists` }, { status: 409 });
    }

    const fee = await db.systemSetting.create({
      data: {
        key,
        value: String(amount),
        type: 'number',
        category: 'fees',
        label,
        active: active !== false,
        updatedBy: payload?.id,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'fee_create',
        description: `Created fee "${key}" = ₦${amount}`,
        module: 'superadmin',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ fee }, { status: 201 });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
