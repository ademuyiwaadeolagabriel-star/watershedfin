import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { KYC_STATUSES } from '@/lib/constants';

/**
 * GET /api/admin/customers
 * Query: ?search=&kycStatus=&branchId=&page=
 *
 * Returns paginated list of all customers (Users) with business, branch and
 * loan counts, plus aggregate stats.
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const search = (searchParams.get('search') || '').trim();
    const kycStatus = searchParams.get('kycStatus') || '';
    const branchId = searchParams.get('branchId') || '';
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const pageSize = 50;

    // Build where clause
    const where: any = {};
    if (kycStatus) where.kycStatus = kycStatus;
    if (branchId) where.branchId = branchId;
    if (search) {
      where.OR = [
        { firstName: { contains: search } },
        { lastName: { contains: search } },
        { email: { contains: search } },
        { phone: { contains: search } },
        { bvn: { contains: search } },
        { accountNumber: { contains: search } },
      ];
    }

    const [customers, total, approved, pending, declined] = await Promise.all([
      db.user.findMany({
        where,
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          bvn: true,
          accountNumber: true,
          kycStatus: true,
          createdAt: true,
          business: { select: { id: true, name: true, sector: true } },
          branch: { select: { id: true, name: true, code: true } },
          _count: { select: { loans: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      db.user.count({ where }),
      db.user.count({ where: { kycStatus: KYC_STATUSES.APPROVED } }),
      db.user.count({
        where: {
          kycStatus: { in: [KYC_STATUSES.PENDING, KYC_STATUSES.PROCESSING, KYC_STATUSES.RESUBMIT] },
        },
      }),
      db.user.count({ where: { kycStatus: KYC_STATUSES.DECLINED } }),
    ]);

    return NextResponse.json({
      customers,
      stats: { total, approved, pending, declined },
      page,
      pageSize,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    });
  } catch (e: any) {
    console.error('Customer list API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
