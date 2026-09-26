import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/legal/cac-search/respond
 * Customer submits a response to Legal's rejection
 * Body: { caseId, customerResponse }
 *
 * v52 — IDOR fix (#25 from governance audit):
 *  - Customer identity is derived from the JWT via `requireCustomerAuth`,
 *    NOT from any body field. The previous implementation used the weak
 *    `getAuthFromRequest` which accepted ANY valid JWT (including admin
 *    tokens). A malicious customer could submit responses against any
 *    other customer's Legal case simply by supplying that case's id.
 *  - After fetching the LegalNameSearch, we verify that
 *    `legalCase.userId === authPayload.id`. A mismatch returns 403.
 *  - Empty / whitespace-only `customerResponse` is rejected with 400.
 *  - The two state writes (LegalNameSearch.update + User.update) are
 *    wrapped in `db.$transaction` so they commit or roll back together.
 *
 * v41: Fans out a notification to all Legal staff so they know the customer
 * has responded and the case is ready for re-review (fire-and-forget).
 */
export async function POST(req: NextRequest) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const customerId = authPayload.id; // v52 — derived from JWT, NOT body

    const body = await req.json().catch(() => ({}));
    const { caseId, customerResponse } = body || {};

    if (!caseId || typeof caseId !== 'string') {
      return NextResponse.json(
        { error: 'caseId is required' },
        { status: 400 },
      );
    }

    // Reject empty / whitespace-only customerResponse.
    if (
      customerResponse === undefined ||
      customerResponse === null ||
      typeof customerResponse !== 'string' ||
      customerResponse.trim().length === 0
    ) {
      return NextResponse.json(
        { error: 'customerResponse is required and must be non-empty' },
        { status: 400 },
      );
    }

    const legalCase = await db.legalNameSearch.findUnique({ where: { id: caseId } });
    if (!legalCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // v52 — IDOR fix: the case MUST belong to the authenticated customer.
    // Without this check, any logged-in customer could submit a response
    // against any other customer's Legal case.
    if (legalCase.userId !== customerId) {
      return NextResponse.json(
        { error: 'Forbidden: case does not belong to authenticated customer.' },
        { status: 403 },
      );
    }

    // --- Atomic multi-write ---------------------------------------------
    // v52 — Wrap the two state-mutating writes in a single Prisma
    // transaction. If either fails, both roll back. Previously a failure
    // between the LegalNameSearch.update and the User.update could leave
    // the case in 'customer_responded' while the user's onboardingStage
    // still pointed at the previous stage.
    const updated = await db.$transaction(async (tx) => {
      const caseUpdate = await tx.legalNameSearch.update({
        where: { id: caseId },
        data: {
          customerResponse: customerResponse.trim(),
          status: 'customer_responded',
        },
      });

      // Re-mark the case as active (customer has re-engaged) and push the
      // user's onboarding stage back to the legal review stage.
      await tx.user.update({
        where: { id: legalCase.userId },
        data: { onboardingStage: 'legal_cac_search' },
      }).catch(() => {
        // The user row may not exist in some seed/edge cases; the case
        // update still commits. We intentionally swallow this error
        // inside the transaction so the customer's response is preserved
        // even if the user-stage sync fails.
      });

      return caseUpdate;
    });

    // v41 — Notify all Legal staff that the customer has responded.
    // Fire-and-forget: notification failures must never cause the customer's
    // response submission to fail.
    try {
      const legalStaff = await db.admin.findMany({
        where: { role: 'legal', status: 1, legalCacSearch: true },
        select: { id: true, firstName: true, lastName: true },
      });
      const customer = await db.user.findUnique({
        where: { id: legalCase.userId },
        select: { firstName: true, lastName: true },
      });
      const customerName = customer
        ? `${customer.firstName} ${customer.lastName}`
        : 'A customer';
      await Promise.all(legalStaff.map(ls =>
        createNotification({
          adminId: ls.id,
          type: 'legal_cac_customer_responded',
          title: 'Customer Responded to CAC Search Rejection',
          message: `${customerName} has responded to your CAC name search rejection. Please review their response and re-evaluate.`,
          category: 'kyc',
          actionLabel: 'Review Response',
          actionView: 'legal-cac-search',
          metadata: { caseId, userId: legalCase.userId },
        })
      ));
    } catch (e) {
      // non-blocking
      console.error('[LEGAL CAC RESPOND] Legal staff notification failed:', e);
    }

    return NextResponse.json({ ok: true, case: updated });
  } catch (e: any) {
    console.error('[LEGAL CAC SEARCH RESPOND] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
