import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const body = await req.json();
    const existing = await db.chartOfAccount.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'Account not found' }, { status: 404 });
    if (existing.isSystem && body.code && body.code !== existing.code) {
      return NextResponse.json({ error: 'Cannot change system account code' }, { status: 400 });
    }

    const account = await db.chartOfAccount.update({
      where: { id },
      data: {
        code: body.code ?? existing.code,
        name: body.name ?? existing.name,
        type: body.type ?? existing.type,
        subType: body.subType !== undefined ? body.subType : existing.subType,
        currency: body.currency ?? existing.currency,
        isActive: body.isActive !== undefined ? body.isActive : existing.isActive,
        balance: body.balance !== undefined ? Number(body.balance) : existing.balance,
        parentId: body.parentId !== undefined ? body.parentId || null : existing.parentId,
      },
    });
    return NextResponse.json({ account });
  } catch (e: any) {
    console.error('COA PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const itemCount = await db.journalItem.count({ where: { accountId: id } });
    if (itemCount > 0) {
      return NextResponse.json({ error: 'Cannot delete account with journal items' }, { status: 400 });
    }
    const acc = await db.chartOfAccount.findUnique({ where: { id } });
    if (acc?.isSystem) {
      return NextResponse.json({ error: 'Cannot delete system account' }, { status: 400 });
    }
    await db.chartOfAccount.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('COA DELETE error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
