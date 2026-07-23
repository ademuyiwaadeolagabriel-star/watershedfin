import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * GET /api/admin/cs/payments
 * Returns pending onboarding payments for CS verification.
 *
 * v41: Now returns BOTH manual-transfer payments (need CS confirmation)
 * AND Paystack payments that are still pending (webhook may not have fired
 * or webhook isn't configured). CS can manually confirm Paystack payments
 * as a fallback.
 *
 * Query params:
 *   ?status=pending|confirmed|rejected|all  (default: pending)
 *   ?method=transfer|paystack|all           (default: all)
 */
export async function GET(req: NextRequest) {
  const auth = await requireRole(req, ['super', 'cs', 'admin']);
  if (auth instanceof NextResponse) return auth;

  try {
    const { searchParams } = new URL(req.url);
    const statusFilter = searchParams.get('status') || 'pending';
    const methodFilter = searchParams.get('method') || 'all';

    const where: any = {};
    if (statusFilter !== 'all') where.status = statusFilter;
    if (methodFilter !== 'all') where.method = methodFilter;

    const payments = await db.onboardingPayment.findMany({
      where,
      include: {
        user: {
          select: { id: true, firstName: true, lastName: true, email: true, phone: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    return NextResponse.json({ payments });
  } catch (e: any) {
    console.error('[CS PAYMENTS] GET error:', e);
    return NextResponse.json(
      { error: 'Failed to load payments. Run: npx prisma db push', details: e.message },
      { status: 500 }
    );
  }
}
