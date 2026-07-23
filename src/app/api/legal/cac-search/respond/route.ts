import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * POST /api/legal/cac-search/respond
 * Customer submits a response to Legal's rejection
 * Body: { caseId, customerResponse }
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

    return NextResponse.json({ ok: true, case: updated });
  } catch (e: any) {
    console.error('[LEGAL CAC SEARCH RESPOND] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
