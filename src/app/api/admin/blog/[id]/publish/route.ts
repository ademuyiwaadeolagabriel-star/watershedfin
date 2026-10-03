import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * POST /api/admin/blog/[id]/publish
 * Authorization: Bearer <admin-jwt>
 *
 * v50 FIX (Issue #27): Removed the `body.adminId` fallback. Identity
 * MUST come from the JWT — never from caller-supplied data. The
 * previous `authPayload?.id || body.adminId` pattern allowed any
 * authenticated admin to impersonate any other admin in audit logs
 * simply by passing the other admin's ID in the request body.
 */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // v50 — auth gate mandatory, no fallback.
    const authResult = await requireRole(req, ['super', 'admin']);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; role: string };
    const adminId = authPayload.id;

    const { id } = await params;

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

    // Audit log — actor always derived from the JWT.
    const actor = await db.admin.findUnique({
      where: { id: adminId },
      select: { id: true, firstName: true, lastName: true, role: true },
    });
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

