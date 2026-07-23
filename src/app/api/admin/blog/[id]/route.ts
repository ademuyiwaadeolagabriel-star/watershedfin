import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * /api/admin/blog/[id]
 *
 * GET    — single blog post by ID
 * PUT    — update fields (title, slug, body, image, categoryId, status)
 * DELETE — remove blog post (with audit log)
 *
 * Every response is sanitized to strip secrets (Blog has none, but be
 * consistent with the rest of the platform).
 */

function slugify(input: string): string {
  return input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

async function ensureUniqueSlug(
  base: string,
  excludeId: string
): Promise<string> {
  const seed = base || 'post';
  let slug = seed;
  let n = 1;
  for (;;) {
    const existing = await db.blog.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!existing || existing.id === excludeId) return slug;
    n += 1;
    slug = `${seed}-${n}`;
  }
}

async function getActor(adminId: string | null | undefined) {
  if (!adminId) return null;
  return db.admin.findUnique({
    where: { id: adminId },
    select: { id: true, firstName: true, lastName: true, role: true },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const post = await db.blog.findUnique({
      where: { id },
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

    if (!post) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    return NextResponse.json({ post });
  } catch (e: any) {
    console.error('Admin blog detail API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();

    const existing = await db.blog.findUnique({
      where: { id },
      select: { id: true, slug: true, title: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    const data: any = {};

    if (typeof body.title === 'string' && body.title.trim()) {
      data.title = body.title.trim();
    }

    // Slug handling
    if (typeof body.slug === 'string' && body.slug.trim()) {
      const candidate = slugify(body.slug);
      data.slug = await ensureUniqueSlug(candidate, id);
    } else if (data.title && !body.slug) {
      // If title changed but no slug provided, regenerate slug from title
      const candidate = slugify(data.title);
      if (candidate !== existing.slug) {
        data.slug = await ensureUniqueSlug(candidate, id);
      }
    }

    if (typeof body.body === 'string') {
      data.body = body.body;
    }
    if (typeof body.image === 'string') {
      data.image = body.image.trim() || null;
    }
    if (body.categoryId !== undefined) {
      if (body.categoryId === null || body.categoryId === '') {
        data.categoryId = null;
      } else {
        const cat = await db.category.findUnique({
          where: { id: body.categoryId },
          select: { id: true },
        });
        data.categoryId = cat ? cat.id : null;
      }
    }
    if (body.status === 'published' || body.status === 'draft') {
      data.status = body.status;
    }

    const updated = await db.blog.update({
      where: { id },
      data,
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
    const actor = await getActor(authPayload.id);
    if (actor) {
      await db.auditLog.create({
        data: {
          adminId: actor.id,
          action: 'updated',
          module: 'blog',
          description: `${actor.firstName} ${actor.lastName} updated blog post "${updated.title}"`,
          severity: 'info',
          metadata: JSON.stringify({
            blogId: updated.id,
            slug: updated.slug,
            changedFields: Object.keys(data),
          }),
        },
      });
    }

    return NextResponse.json({ post: updated });
  } catch (e: any) {
    console.error('Update blog post API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json().catch(() => ({}));

    const existing = await db.blog.findUnique({
      where: { id },
      select: { id: true, title: true, slug: true },
    });
    if (!existing) {
      return NextResponse.json({ error: 'Post not found' }, { status: 404 });
    }

    await db.blog.delete({ where: { id } });

    // Audit log
    const authPayload = getAuthFromRequest(req);
    const adminId = authPayload?.id || body.adminId;
    const actor = await getActor(adminId);
    if (actor) {
      await db.auditLog.create({
        data: {
          adminId: actor.id,
          action: 'deleted',
          module: 'blog',
          description: `${actor.firstName} ${actor.lastName} deleted blog post "${existing.title}"`,
          severity: 'warning',
          metadata: JSON.stringify({
            blogId: existing.id,
            slug: existing.slug,
          }),
        },
      });
    }

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error('Delete blog post API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
