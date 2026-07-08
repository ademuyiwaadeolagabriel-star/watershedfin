import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/onboard/search?q=email_or_phone_or_bvn_or_nin_or_account
 * Returns users matching the query on email, phone, bvn, nin, or accountNumber.
 * Passwords are stripped from every record.
 *
 * Note: SQLite's LIKE is case-insensitive for ASCII by default, so Prisma's
 * `contains` filter behaves like ILIKE here.
 */
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get('q') || '').trim();

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [], query: q });
    }

    const users = await db.user.findMany({
      where: {
        OR: [
          { email: { contains: q } },
          { phone: { contains: q } },
          { bvn: { contains: q } },
          { nin: { contains: q } },
          { accountNumber: { contains: q } },
        ],
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
      include: {
        business: { select: { id: true, name: true, legalStructure: true } },
        branch: { select: { id: true, name: true, code: true } },
        loanOfficer: {
          select: { id: true, firstName: true, lastName: true, username: true },
        },
      },
    });

    const safe = users.map((u: any) => {
      const { password, ...rest } = u;
      return rest;
    });

    return NextResponse.json({ users: safe, query: q });
  } catch (e: any) {
    console.error('Onboard search API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
