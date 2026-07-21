import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';

/**
 * POST /api/admin/cs/payments/[id]/confirm
 * Body: { action: 'confirm' | 'reject', reason? }
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super', 'cs', 'admin']);
  if (auth instanceof NextResponse) return auth;
  const payload = getAuthFromRequest(req);

  try {
    const { id } = await params;
    const body = await req.json();
    const { action, reason } = body;

    const payment = await db.onboardingPayment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (action === 'confirm') {
      await db.onboardingPayment.update({
        where: { id },
        data: {
          status: 'confirmed',
          confirmedById: payload?.id,
          confirmedAt: new Date(),
        },
      });

      // Advance onboarding stage to legal_cac_search
      await db.user.update({
        where: { id: payment.userId },
        data: { onboardingStage: 'legal_cac_search' },
      });

      // Create Legal CAC Name Search case
      await db.legalNameSearch.create({
        data: { userId: payment.userId, status: 'pending' },
      });

      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'payment_confirmed',
          description: `Confirmed onboarding payment ₦${payment.amount} for user ${payment.userId}`,
          module: 'cs',
          severity: 'info',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });

      return NextResponse.json({ ok: true });
    } else if (action === 'reject') {
      await db.onboardingPayment.update({
        where: { id },
        data: {
          status: 'rejected',
          confirmedById: payload?.id,
          confirmedAt: new Date(),
        },
      });

      await db.user.update({
        where: { id: payment.userId },
        data: { onboardingStage: 'payment_pending' },
      });

      await db.auditLog.create({
        data: {
          adminId: payload?.id,
          action: 'payment_rejected',
          description: `Rejected onboarding payment for user ${payment.userId}: ${reason || 'no reason'}`,
          module: 'cs',
          severity: 'warning',
          ipAddress: req.headers.get('x-forwarded-for') || undefined,
        },
      });

      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
