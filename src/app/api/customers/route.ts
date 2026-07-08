import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/customers?count=true&filter=<filter>
 * Returns either a list of customers or a count (when count=true).
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const countOnly = searchParams.get('count') === 'true';
    const filter = searchParams.get('filter') || 'all';

    // Build where clause based on filter
    const where: any = {};
    if (filter === 'kyc_verified') {
      where.kycStatus = 'verified';
    } else if (filter === 'active_loan') {
      where.loans = { some: { status: 'running' } };
    } else if (filter === 'lagos') {
      where.branch = { code: { contains: 'LAG' } };
    } else if (filter === 'abuja') {
      where.branch = { code: { contains: 'ABJ' } };
    }

    if (countOnly) {
      const count = await db.user.count({ where });
      return NextResponse.json({ count });
    }

    const users = await db.user.findMany({
      where,
      include: {
        business: { select: { name: true, sector: true } },
        branch: { select: { name: true, code: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });

    // Strip passwords
    const safe = users.map((u: any) => {
      const { password, ...rest } = u;
      return rest;
    });

    return NextResponse.json({ users: safe });
  } catch (e: any) {
    console.error('Customers GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
