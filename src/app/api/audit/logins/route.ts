import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (from || to) {
      where.createdAt = {} as any;
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }

    const [total, items, failedCount] = await Promise.all([
      db.loginHistory.count({ where }),
      db.loginHistory.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          admin: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
        },
      }),
      db.loginHistory.count({ where: { status: 'failed', ...(where.createdAt ? { createdAt: where.createdAt } : {}) } }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      failedCount,
    });
  } catch (e: any) {
    console.error('Login history API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
