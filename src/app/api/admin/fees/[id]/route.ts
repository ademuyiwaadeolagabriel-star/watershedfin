import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super', 'cfo']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { id } = await params;
    const body = await req.json();
    const { label, amount, active } = body;

    const existing = await db.systemSetting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
    }

    const updated = await db.systemSetting.update({
      where: { id },
      data: {
        ...(label !== undefined && { label }),
        ...(amount !== undefined && { value: String(amount) }),
        ...(active !== undefined && { active }),
        updatedBy: payload?.id,
      },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'fee_update',
        description: `Updated fee "${updated.key}" → ₦${updated.value} (active=${updated.active})`,
        module: 'superadmin',
        severity: 'info',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ fee: updated });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { id } = await params;
    const existing = await db.systemSetting.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: 'Fee not found' }, { status: 404 });
    }

    // Soft delete: set active=false
    await db.systemSetting.update({
      where: { id },
      data: { active: false, updatedBy: payload?.id },
    });

    await db.auditLog.create({
      data: {
        adminId: payload?.id,
        action: 'fee_delete',
        description: `Deactivated fee "${existing.key}"`,
        module: 'superadmin',
        severity: 'warning',
        ipAddress: req.headers.get('x-forwarded-for') || undefined,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
