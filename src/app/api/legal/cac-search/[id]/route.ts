import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

import { safeError } from '@/lib/security/errors';
/**
 * GET /api/legal/cac-search?userId=xxx
 * Returns the user's legal case (for the customer's "Respond to Legal" page)
 */
export async function GET(req: NextRequest) {
  try {
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    // v5 — userId from JWT, not query string
    const userId = authPayload.id;
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
    return safeError('An unexpected error occurred.', 500);;
  }
}
