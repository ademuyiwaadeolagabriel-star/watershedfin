import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const action = url.searchParams.get('action');
    const moduleFilter = url.searchParams.get('module');
    const severity = url.searchParams.get('severity');
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const search = url.searchParams.get('search');
    const page = parseInt(url.searchParams.get('page') || '1');
    const pageSize = parseInt(url.searchParams.get('pageSize') || '20');

    const where: any = {};
    if (action && action !== 'all') where.action = action;
    if (moduleFilter && moduleFilter !== 'all') where.module = moduleFilter;
    if (severity && severity !== 'all') where.severity = severity;
    if (from || to) {
      where.createdAt = {} as any;
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    }
    if (search) {
      where.OR = [
        { description: { contains: search } },
        { ipAddress: { contains: search } },
        { userAgent: { contains: search } },
        { action: { contains: search } },
        { admin: { firstName: { contains: search } } },
        { admin: { lastName: { contains: search } } },
        { admin: { username: { contains: search } } },
      ];
    }

    const [total, items] = await Promise.all([
      db.auditLog.count({ where }),
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          admin: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
        },
      }),
    ]);

    // Stats
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const weekAgo = new Date();
    weekAgo.setDate(weekAgo.getDate() - 7);

    const [todayCount, weekCount, criticalCount] = await Promise.all([
      db.auditLog.count({ where: { createdAt: { gte: today } } }),
      db.auditLog.count({ where: { createdAt: { gte: weekAgo } } }),
      db.auditLog.count({ where: { severity: 'critical' } }),
    ]);

    return NextResponse.json({
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
      stats: { total, today: todayCount, thisWeek: weekCount, critical: criticalCount },
    });
  } catch (e: any) {
    console.error('Audit trail API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
