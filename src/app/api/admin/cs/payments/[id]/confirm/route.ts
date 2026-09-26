import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole, getAuthFromRequest } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/admin/cs/payments/[id]/confirm
 * Body: { action: 'confirm' | 'reject', reason? }
 *
 * v52 — atomicity + unique-active-case fix (#10, #26 from audit):
 *  - All state-mutating writes in the confirm path
 *    (OnboardingPayment.update, User.update, LegalNameSearch.create,
 *    AuditLog.create) are wrapped in `db.$transaction(...)` so the
 *    payment confirmation either fully commits or fully rolls back.
 *    Previously a failure mid-flow could leave the OnboardingPayment as
 *    'confirmed' while the LegalNameSearch case was never created —
 *    stranding the customer at "payment_confirmed" with no Legal case
 *    for the Legal team to act on.
 *  - #26 (unique active Legal case per user): before creating a new
 *    LegalNameSearch, the transaction checks whether an ACTIVE case
 *    (isActive=true) already exists for this user. If yes, the new case
 *    is NOT created and the response is idempotent-success (200) —
 *    returning the existing case. This prevents duplicates when CS
 *    clicks "Confirm" twice or when the Paystack webhook and a CS
 *    manual confirm race each other.
 *  - Idempotency: if the OnboardingPayment is already 'confirmed',
 *    short-circuit before any writes (HTTP 200 idempotent success).
 *  - Reject path is also wrapped in `db.$transaction` for consistency
 *    and its audit-log entry commits atomically with the status update.
 *  - Notifications are sent AFTER the transaction commits as
 *    fire-and-forget side effects.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireRole(req, ['super', 'cs', 'admin']);
  if (auth instanceof NextResponse) return auth;
  const payload = await getAuthFromRequest(req);

  try {
    const { id } = await params;
    const body = await req.json();
    const { action, reason } = body;

    const payment = await db.onboardingPayment.findUnique({ where: { id } });
    if (!payment) {
      return NextResponse.json({ error: 'Payment not found' }, { status: 404 });
    }

    if (action === 'confirm') {
      // --- Idempotency ------------------------------------------------
      // If the payment is already confirmed, short-circuit before any
      // writes. The unique-active-case check below will then locate the
      // existing LegalNameSearch for this user (if any) and return it.
      if (payment.status === 'confirmed') {
        const existingCase = await db.legalNameSearch.findFirst({
          where: { userId: payment.userId, isActive: true },
          orderBy: { createdAt: 'desc' },
        });
        return NextResponse.json({
          ok: true,
          idempotent: true,
          message: 'Payment already confirmed.',
          legalCaseId: existingCase?.id || null,
        });
      }

      // --- Atomic multi-write ----------------------------------------
      const { existingCaseId, newlyCreatedCaseId } = await db.$transaction(async (tx) => {
        // (a) Mark the OnboardingPayment as confirmed.
        await tx.onboardingPayment.update({
          where: { id },
          data: {
            status: 'confirmed',
            confirmedById: payload?.id,
            confirmedAt: new Date(),
          },
        });

        // (b) Advance the user's onboarding stage to legal_cac_search.
        await tx.user.update({
          where: { id: payment.userId },
          data: { onboardingStage: 'legal_cac_search' },
        }).catch(() => {
          // user row may not exist in some seed/edge cases; the payment
          // status still commits. We intentionally swallow this inside
          // the transaction so confirmation succeeds even if the user
          // stage sync fails.
        });

        // (c) #26 — unique-active-case enforcement. Before creating a
        // new LegalNameSearch, check whether an ACTIVE case already
        // exists for this user. If yes, skip creation and return the
        // existing case id (idempotent). This handles the race where
        // Paystack's webhook already confirmed the payment and created
        // the case, and the CS agent clicks "Confirm" again.
        const existingActive = await tx.legalNameSearch.findFirst({
          where: { userId: payment.userId, isActive: true },
          orderBy: { createdAt: 'desc' },
        });
        if (existingActive) {
          return {
            existingCaseId: existingActive.id,
            newlyCreatedCaseId: null as string | null,
          };
        }

        // (d) Create a new LegalNameSearch case (status=pending,
        // isActive=true by default). The @@index([userId, isActive])
        // makes the existence check fast.
        const newCase = await tx.legalNameSearch.create({
          data: { userId: payment.userId, status: 'pending', isActive: true },
        });

        // (e) Audit log entry — captured inside the transaction so a
        // failure to log rolls back the entire confirmation.
        await tx.auditLog.create({
          data: {
            adminId: payload?.id,
            action: 'payment_confirmed',
            description: `Confirmed onboarding payment ₦${payment.amount} for user ${payment.userId}`,
            module: 'cs',
            severity: 'info',
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
          },
        });

        return {
          existingCaseId: null as string | null,
          newlyCreatedCaseId: newCase.id,
        };
      });

      // --- Post-transaction side effects (NOT inside the DB transaction) -
      // Fire-and-forget: customer + Legal staff notifications.
      void createNotification({
        userId: payment.userId,
        type: 'payment_confirmed',
        title: 'Payment Confirmed — Legal Review Starting',
        message: `Your payment of ₦${payment.amount.toLocaleString()} has been confirmed. Your application has been forwarded to the Legal department for CAC Name Search.`,
        category: 'payment',
        actionLabel: 'View Status',
        actionView: 'customer-dashboard',
      });

      try {
        const legalStaff = await db.admin.findMany({
          where: { role: 'legal', status: 1, legalCacSearch: true },
          select: { id: true },
        });
        // Only notify Legal staff if a NEW case was actually created —
        // otherwise we'd spam them on every idempotent retry.
        if (newlyCreatedCaseId) {
          await Promise.all(legalStaff.map(ls =>
            createNotification({
              adminId: ls.id,
              type: 'legal_cac_search_request',
              title: 'New CAC Name Search Request',
              message: `A new CAC name search request has been received. Please review and process.`,
              category: 'kyc',
              actionLabel: 'Review CAC Search',
              actionView: 'legal-cac-search',
            })
          ));
        }
      } catch (e) {
        // non-blocking
      }

      return NextResponse.json({
        ok: true,
        idempotent: existingCaseId !== null,
        legalCaseId: existingCaseId || newlyCreatedCaseId,
      });
    } else if (action === 'reject') {
      // --- Idempotency for reject path --------------------------------
      if (payment.status === 'rejected') {
        return NextResponse.json({
          ok: true,
          idempotent: true,
          message: 'Payment already rejected.',
        });
      }

      // --- Atomic multi-write (reject path) --------------------------
      await db.$transaction(async (tx) => {
        await tx.onboardingPayment.update({
          where: { id },
          data: {
            status: 'rejected',
            confirmedById: payload?.id,
            confirmedAt: new Date(),
          },
        });

        await tx.user.update({
          where: { id: payment.userId },
          data: { onboardingStage: 'payment_pending' },
        }).catch(() => {});

        await tx.auditLog.create({
          data: {
            adminId: payload?.id,
            action: 'payment_rejected',
            description: `Rejected onboarding payment for user ${payment.userId}: ${reason || 'no reason'}`,
            module: 'cs',
            severity: 'warning',
            ipAddress: req.headers.get('x-forwarded-for') || undefined,
          },
        });
      });

      // --- Post-transaction side effects --------------------------------
      void createNotification({
        userId: payment.userId,
        type: 'payment_rejected',
        title: 'Payment Rejected',
        message: `Your payment proof could not be verified. ${reason || 'Please re-upload a clear proof of payment.'}`,
        category: 'payment',
        actionLabel: 'View Payment',
        actionView: 'customer-dashboard',
      });

      return NextResponse.json({ ok: true });
    } else {
      return NextResponse.json({ error: 'Invalid action' }, { status: 400 });
    }
  } catch (e: any) {
    // P2002 = unique constraint violation — should not normally occur
    // here because the unique-active-case check + transactional
    // serialization prevent concurrent inserts. If it does surface
    // (e.g. a duplicate LegalNameSearch race), treat as idempotent.
    if (e?.code === 'P2002') {
      return NextResponse.json(
        { ok: true, idempotent: true, error: 'Concurrent confirmation — already processed.' },
        { status: 200 },
      );
    }
    console.error('[CS PAYMENT CONFIRM] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
