import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { createNotification } from '@/lib/notifications';

/**
 * POST /api/legal/cac-search/respond
 * Customer submits a response to Legal's rejection
 * Body: { caseId, customerResponse }
 *
 * v41: Now fans out a notification to all Legal staff so they know the customer
 * has responded and the case is ready for re-review.
 */
export async function POST(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const body = await req.json();
    const { caseId, customerResponse } = body;

    if (!caseId || !customerResponse) {
      return NextResponse.json({ error: 'caseId and customerResponse are required' }, { status: 400 });
    }

    const legalCase = await db.legalNameSearch.findUnique({ where: { id: caseId } });
    if (!legalCase) {
      return NextResponse.json({ error: 'Case not found' }, { status: 404 });
    }

    // Update the case with the customer's response + set status to customer_responded
    const updated = await db.legalNameSearch.update({
      where: { id: caseId },
      data: {
        customerResponse,
        status: 'customer_responded',
      },
    });

    // Update user's onboarding stage
    await db.user.update({
      where: { id: legalCase.userId },
      data: { onboardingStage: 'legal_cac_search' },
    }).catch(() => {});

    // v41: Notify all Legal staff that the customer has responded
    try {
      const legalStaff = await db.admin.findMany({
        where: { role: 'legal', status: 1, legalCacSearch: true },
        select: { id: true, firstName: true, lastName: true },
      });
      const customer = await db.user.findUnique({
        where: { id: legalCase.userId },
        select: { firstName: true, lastName: true },
      });
      const customerName = customer ? `${customer.firstName} ${customer.lastName}` : 'A customer';
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
