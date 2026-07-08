import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const type = url.searchParams.get('type');
    const q = url.searchParams.get('q');
    const where: any = {};
    if (type && type !== 'all') where.type = type;
    if (q) {
      where.OR = [
        { name: { contains: q, mode: 'insensitive' } },
        { code: { contains: q, mode: 'insensitive' } },
      ];
    }
    const accounts = await db.chartOfAccount.findMany({
      where,
      orderBy: [{ type: 'asc' }, { code: 'asc' }],
      include: { parent: true, _count: { select: { journalItems: true } } },
    });
    return NextResponse.json({ accounts });
  } catch (e: any) {
    console.error('COA GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { code, name, type, subType, openingBalance, parentId, currency, isActive } = body;
    if (!code || !name || !type) {
      return NextResponse.json({ error: 'code, name, type required' }, { status: 400 });
    }
    const dup = await db.chartOfAccount.findUnique({ where: { code } });
    if (dup) return NextResponse.json({ error: 'Account code already exists' }, { status: 400 });

    const account = await db.chartOfAccount.create({
      data: {
        code,
        name,
        type,
        subType: subType || null,
        currency: currency || 'NGN',
        isActive: isActive !== false,
        balance: Number(openingBalance) || 0,
        parentId: parentId || null,
      },
    });
    return NextResponse.json({ account }, { status: 201 });
  } catch (e: any) {
    console.error('COA POST error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
