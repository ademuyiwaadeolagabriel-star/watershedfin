import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * GET /api/admin/cs/payments
 * Returns pending manual-transfer onboarding payments for CS verification
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'cs', 'admin']);
  if (auth instanceof NextResponse) return auth;

  const payments = await db.onboardingPayment.findMany({
    where: { method: 'transfer', status: 'pending' },
    include: {
      user: {
        select: { id: true, firstName: true, lastName: true, email: true, phone: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return NextResponse.json({ payments });
}
