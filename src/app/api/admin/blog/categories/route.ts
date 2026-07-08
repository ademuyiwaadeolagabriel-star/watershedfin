import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * GET /api/admin/blog/categories
 *
 * Returns all blog-type categories for use in the editor dropdown.
 * (Category table has no secrets — returned as-is.)
 */
export async function GET(_req: NextRequest) {
  try {
    const categories = await db.category.findMany({
      where: { type: 'blog' },
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        slug: true,
        type: true,
        createdAt: true,
      },
    });
    return NextResponse.json({ categories });
  } catch (e: any) {
    console.error('List blog categories API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
