import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get('from');
    const to = url.searchParams.get('to');
    const days = parseInt(url.searchParams.get('days') || '30');

    const where: any = {};
    if (from || to) {
      where.createdAt = {} as any;
      if (from) where.createdAt.gte = new Date(from);
      if (to) where.createdAt.lte = new Date(to);
    } else {
      const since = new Date();
      since.setDate(since.getDate() - days);
      where.createdAt = { gte: since };
    }

    // Group by action
    const all = await db.auditLog.findMany({
      where,
      select: { action: true, module: true, severity: true, createdAt: true },
    });

    const byAction: Record<string, number> = {};
    const byModule: Record<string, number> = {};
    const bySeverity: Record<string, number> = {};
    const byDay: Record<string, number> = {};

    for (const a of all) {
      byAction[a.action] = (byAction[a.action] || 0) + 1;
      if (a.module) byModule[a.module] = (byModule[a.module] || 0) + 1;
      bySeverity[a.severity] = (bySeverity[a.severity] || 0) + 1;
      const day = new Date(a.createdAt).toISOString().slice(0, 10);
      byDay[day] = (byDay[day] || 0) + 1;
    }

    const chart = Object.entries(byAction)
      .map(([action, count]) => ({ action, count }))
      .sort((a, b) => b.count - a.count);

    const moduleChart = Object.entries(byModule)
      .map(([module, count]) => ({ module, count }))
      .sort((a, b) => b.count - a.count);

    const trend = Object.entries(byDay)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => a.date.localeCompare(b.date));

    const recent = await db.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 20,
      include: {
        admin: { select: { id: true, firstName: true, lastName: true, username: true, role: true } },
      },
    });

    return NextResponse.json({
      total: all.length,
      byAction: chart,
      byModule: moduleChart,
      bySeverity,
      trend,
      recent,
    });
  } catch (e: any) {
    console.error('Audit activity API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
