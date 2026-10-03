import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * GET /api/legal/cac-search?userId=xxx
 * Returns the user's legal case (for the customer's "Respond to Legal" page)
 */
export async function GET(req: NextRequest) {
  try {
    const authResult = await requireRole(req, ['super', 'legal']);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult;

    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }

    // Get the most recent legal case for this user
    const legalCase = await db.legalNameSearch.findFirst({
      where: { userId },
      orderBy: { createdAt: 'desc' },
    });

    return NextResponse.json({ case: legalCase });
  } catch (e: any) {
    console.error('[LEGAL CAC SEARCH] GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
