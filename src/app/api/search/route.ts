import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/search?q=&adminId=
 *
 * Global search across Loans, Customers, Staff and Branches.
 * - Each category is limited to 10 results.
 * - Uses Prisma `contains` (case-insensitive on SQLite).
 * - Passwords / tokens are stripped from every result.
 * - If `adminId` is provided and the admin is a branch-scoped (non-central)
 *   role, results are filtered to that admin's branch only. Central roles
 *   (super, md, cfo, hoc, cro, legal) get the global view.
 */

const CENTRAL_ROLES = new Set(['super', 'md', 'cfo', 'hoc', 'cro', 'legal']);

const LIMIT = 10;

function sanitize<T>(row: T): T {
  if (row && typeof row === 'object') {
    const {
      password,
      token,
      tokenExpired,
      googlefaSecret,
      pin,
      ...safe
    } = row as any;
    return safe as T;
  }
  return row;
}

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = (searchParams.get('q') || '').trim();
    const adminId = (searchParams.get('adminId') || '').trim();

    if (!q) {
      return NextResponse.json({
        loans: [],
        customers: [],
        staff: [],
        branches: [],
        total: 0,
      });
    }

    // Resolve admin scope (branch filtering)
    let branchScope: string | null = null;
    if (adminId) {
      const admin = await db.admin.findUnique({
        where: { id: adminId },
        select: { id: true, role: true, branchId: true },
      });
      if (admin && !CENTRAL_ROLES.has(admin.role) && admin.branchId) {
        branchScope = admin.branchId;
      }
    }

    // Build parallel queries
    const [loans, customers, staff, branches] = await Promise.all([
      // ── Loans ────────────────────────────────────────────────────────────
      db.loanApplicants.findMany({
        where: {
          ...(branchScope ? { branchId: branchScope } : {}),
          OR: [
            { applicationRef: { contains: q } },
            { reason: { contains: q } },
            { user: { firstName: { contains: q } } },
            { user: { lastName: { contains: q } } },
            { user: { email: { contains: q } } },
            { user: { phone: { contains: q } } },
            { user: { business: { name: { contains: q } } } },
          ],
        },
        take: LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          applicationRef: true,
          amount: true,
          status: true,
          currentStep: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              firstName: true,
              lastName: true,
              email: true,
              phone: true,
              business: { select: { id: true, name: true } },
            },
          },
        },
      }),

      // ── Customers / Users ────────────────────────────────────────────────
      db.user.findMany({
        where: {
          ...(branchScope ? { branchId: branchScope } : {}),
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { email: { contains: q } },
            { phone: { contains: q } },
            { bvn: { contains: q } },
            { accountNumber: { contains: q } },
          ],
        },
        take: LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          email: true,
          phone: true,
          accountNumber: true,
          bvn: true,
          kycStatus: true,
          status: true,
          createdAt: true,
          business: { select: { id: true, name: true } },
        },
      }),

      // ── Staff / Admins ───────────────────────────────────────────────────
      db.admin.findMany({
        where: {
          ...(branchScope ? { branchId: branchScope } : {}),
          OR: [
            { firstName: { contains: q } },
            { lastName: { contains: q } },
            { username: { contains: q } },
            { email: { contains: q } },
          ],
        },
        take: LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          firstName: true,
          lastName: true,
          username: true,
          email: true,
          role: true,
          roleType: true,
          status: true,
          branch: { select: { id: true, name: true, code: true } },
        },
      }),

      // ── Branches ─────────────────────────────────────────────────────────
      // Branches are not branch-scoped (they ARE the branches); always global.
      db.branch.findMany({
        where: {
          OR: [
            { name: { contains: q } },
            { code: { contains: q } },
            { state: { contains: q } },
          ],
        },
        take: LIMIT,
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          name: true,
          code: true,
          state: true,
          status: true,
        },
      }),
    ]);

    const safeLoans = loans.map((l) => sanitize(l));
    const safeCustomers = customers.map((c) => sanitize(c));
    const safeStaff = staff.map((s) => sanitize(s));
    const safeBranches = branches.map((b) => sanitize(b));

    const total =
      safeLoans.length +
      safeCustomers.length +
      safeStaff.length +
      safeBranches.length;

    return NextResponse.json({
      loans: safeLoans,
      customers: safeCustomers,
      staff: safeStaff,
      branches: safeBranches,
      total,
    });
  } catch (e: any) {
    console.error('Global search API error:', e);
    return NextResponse.json(
      { error: e.message || 'Search failed' },
      { status: 500 }
    );
  }
}
