import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * GET /api/customers/search?q=<query>
 * Universal client search by email, phone, BVN, NIN, account number, or name.
 * Accessible by: super, loan (LO), frontdesk, bm, hoc, cro, analyst
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireRole(req, ['super', 'md', 'hoc', 'cro', 'credit', 'loan', 'lo', 'bm', 'analyst', 'cs', 'frontdesk']);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult;

    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim().toLowerCase();

    if (!q || q.length < 2) {
      return NextResponse.json({ users: [] });
    }

    // Search across multiple fields
    const branchScoped = ['bm', 'loan', 'lo', 'frontdesk'].includes(authPayload.role);
    const users = await db.user.findMany({
      where: {
        ...(branchScoped && authPayload.branchId ? { branchId: authPayload.branchId } : {}),
        OR: [
          { email: { contains: q, mode: 'insensitive' } },
          { phone: { contains: q } },
          { bvn: { contains: q } },
          { nin: { contains: q } },
          { accountNumber: { contains: q } },
          { firstName: { contains: q, mode: 'insensitive' } },
          { lastName: { contains: q, mode: 'insensitive' } },
        ],
      },
      include: {
        business: { select: { name: true, sectorRef: { select: { name: true } } } },
        branch: { select: { name: true, code: true } },
        loanOfficer: { select: { firstName: true, lastName: true } },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });

    // Strip passwords
    const safe = users.map((u: any) => {
      const { password, ...rest } = u;
      return rest;
    });

    return NextResponse.json({ users: safe });
  } catch (e: any) {
    console.error('Customer search error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
