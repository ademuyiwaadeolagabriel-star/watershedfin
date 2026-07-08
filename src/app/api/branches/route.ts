import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');

    const where: any = {};
    if (status && status !== 'all') where.status = status;

    const branches = await db.branch.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        manager: { select: { id: true, firstName: true, lastName: true, username: true } },
        _count: { select: { staff: true, customers: true } },
      },
    });

    return NextResponse.json({ branches });
  } catch (e: any) {
    console.error('List branches API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body.name || !body.code) {
      return NextResponse.json({ error: 'Name and code are required' }, { status: 400 });
    }
    const existing = await db.branch.findUnique({ where: { code: body.code } });
    if (existing) {
      return NextResponse.json({ error: 'Branch code already exists' }, { status: 400 });
    }

    const branch = await db.branch.create({
      data: {
        name: body.name,
        code: body.code,
        state: body.state || null,
        address: body.address || null,
        phoneContact: body.phoneContact || null,
        managerId: body.managerId || null,
        status: body.status || 'active',
      },
    });
    return NextResponse.json({ branch });
  } catch (e: any) {
    console.error('Create branch API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
