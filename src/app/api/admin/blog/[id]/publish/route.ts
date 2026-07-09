import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * POST /api/admin/blog/[id]/publish
 *
 * Body: { adminId }
 * - Sets status = 'published'
 * - Creates an audit log entry
 * - Returns the updated post (sanitised — Blog has no secrets).
 */

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));
    const adminId = authPayload.id;

    const existing = await db.blog.findUnique({
      where: { id },
      select: { id: true, title: true, slug: true, status: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const updated = await db.blog.update({
      where: { id },
      data: { status: 'published' },
      include: {
        category: { select: { id: true, name: true, slug: true } },
        author: {
          select: {
            id: true,
            firstName: true,
            lastName: true,
            username: true,
            email: true,
            role: true,
          },
        },
      },
    });

    // Audit log
    let actor = null;
    if (adminId) {
      actor = await db.admin.findUnique({
        where: { id: adminId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });
    }
    if (actor) {
      await db.auditLog.create({
        data: {
          adminId: actor.id,
          action: 'published',
          module: 'blog',
          description: `${actor.firstName} ${actor.lastName} published blog post "${updated.title}"`,
          severity: 'info',
          metadata: JSON.stringify({
            blogId: updated.id,
            slug: updated.slug,
            previousStatus: existing.status,
          }),
        },
      });
    }

    return NextResponse.json({ post: updated });
  } catch (e: any) {
    console.error('Publish blog post API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
