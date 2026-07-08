import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { PERMISSION_FLAGS } from '@/lib/constants';

/**
 * GET /api/admin/staff/[id]
 * Returns the admin record (without secrets) with branch + all permission
 * flags + loan counts (assigned, processed, approved).
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const admin = await db.admin.findUnique({
      where: { id },
      select: {
        id: true,
        firstName: true,
        lastName: true,
        username: true,
        email: true,
        phone: true,
        avatar: true,
        role: true,
        roleType: true,
        status: true,
        branchId: true,
        lastLogin: true,
        lastLoginIp: true,
        createdAt: true,
        branch: { select: { id: true, name: true, code: true, state: true } },
        ...Object.fromEntries(PERMISSION_FLAGS.map((f) => [f, true])),
      },
    });

    if (!admin) {
      return NextResponse.json({ error: 'Staff not found' }, { status: 404 });
    }

    // Loan counts — assigned (loanOfficer), processed (bmValidatedBy),
    // approved (final approval recorded)
    const [assignedLoans, processedLoans, approvedLoans] = await Promise.all([
      db.loanApplicants.count({ where: { staffId: id } }),
      db.loanApplicants.count({ where: { bmValidatedBy: id } }),
      db.loanApplicants.count({
        where: {
          AND: [
            { staffId: id },
            { status: { in: ['running', 'paid'] } },
          ],
        },
      }),
    ]);

    return NextResponse.json({
      admin,
      stats: {
        assignedLoans,
        processedLoans,
        approvedLoans,
      },
    });
  } catch (e: any) {
    console.error('Admin staff detail API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
