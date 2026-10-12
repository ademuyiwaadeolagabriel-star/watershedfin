import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

import { safeError } from '@/lib/security/errors';
// ============================================================================
// /api/faq/[id]/view
// POST — increment view count on a single FAQ article (fire-and-forget)
// ============================================================================

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;
    await db.faqArticle
      .update({
        where: { id },
        data: { views: { increment: 1 } },
      })
      .catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    return safeError('An unexpected error occurred.', 500);;
  }
}
