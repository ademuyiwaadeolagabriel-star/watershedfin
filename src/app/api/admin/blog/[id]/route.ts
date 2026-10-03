import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

/**
 * /api/admin/blog/[id]
 *
 * GET    — single blog post by ID
 * PUT    — update fields (title, slug, body, image, categoryId, status)
 * DELETE — remove blog post (with audit log)
 *
 * Authorization:
 * - PUT/DELETE require an authenticated admin with an allowed role.
 * - Actor identity is always derived from the verified JWT.
 * - No caller-supplied adminId/userId is trusted.
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
  excludeId: string,
): Promise<string> {
  const seed = base || 'post';

  let slug = seed;
  let n = 1;

  for (;;) {
    const existing = await db.blog.findUnique({
      where: { slug },
      select: { id: true },
    });

    if (!existing || existing.id === excludeId) {
      return slug;
    }

    n += 1;
    slug = `${seed}-${n}`;
  }
}

async function getActor(
  adminId: string | null | undefined,
) {
  if (!adminId) {
    return null;
  }

  return db.admin.findUnique({
    where: { id: adminId },
    select: {
      id: true,
      firstName: true,
      lastName: true,
      role: true,
    },
  });
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    const post = await db.blog.findUnique({
      where: { id },
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
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
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 },
      );
    }

    return NextResponse.json({ post });
  } catch (error) {
    console.error('Admin blog detail API error:', error);

    return NextResponse.json(
      { error: 'Failed to load blog post' },
      { status: 500 },
    );
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params;

    // v50/v54 — mandatory server-side admin authorization.
    // Identity comes from the verified JWT, never from request body.
    const authResult = await requireRole(req, ['super', 'admin']);

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const authPayload = authResult;

    const body = await req.json();

    const existing = await db.blog.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        title: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 },
      );
    }

    const data: {
      title?: string;
      slug?: string;
      body?: string;
      image?: string | null;
      categoryId?: string | null;
      status?: string;
    } = {};

    if (
      typeof body.title === 'string' &&
      body.title.trim()
    ) {
      data.title = body.title.trim();
    }

    // ------------------------------------------------------------
    // Slug handling
    // ------------------------------------------------------------
    if (
      typeof body.slug === 'string' &&
      body.slug.trim()
    ) {
      const candidate = slugify(body.slug);

      data.slug = await ensureUniqueSlug(
        candidate,
        id,
      );
    } else if (
      data.title &&
      !body.slug
    ) {
      // If title changed but no slug was supplied,
      // regenerate the slug from the new title.
      const candidate = slugify(data.title);

      if (candidate !== existing.slug) {
        data.slug = await ensureUniqueSlug(
          candidate,
          id,
        );
      }
    }

    // ------------------------------------------------------------
    // Body
    // ------------------------------------------------------------
    if (typeof body.body === 'string') {
      data.body = body.body;
    }

    // ------------------------------------------------------------
    // Image
    // ------------------------------------------------------------
    if (typeof body.image === 'string') {
      data.image = body.image.trim() || null;
    }

    // ------------------------------------------------------------
    // Category
    // ------------------------------------------------------------
    if (body.categoryId !== undefined) {
      if (
        body.categoryId === null ||
        body.categoryId === ''
      ) {
        data.categoryId = null;
      } else if (
        typeof body.categoryId === 'string'
      ) {
        const category =
          await db.category.findUnique({
            where: {
              id: body.categoryId,
            },
            select: {
              id: true,
            },
          });

        // Preserve existing behavior:
        // invalid category IDs become null.
        data.categoryId =
          category?.id ?? null;
      }
    }

    // ------------------------------------------------------------
    // Status
    // ------------------------------------------------------------
    if (
      body.status === 'published' ||
      body.status === 'draft'
    ) {
      data.status = body.status;
    }

    const updated = await db.blog.update({
      where: { id },
      data,
      include: {
        category: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
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

    // ------------------------------------------------------------
    // Audit log
    // Actor is always the verified JWT identity.
    // ------------------------------------------------------------
    const actor = await getActor(
      authPayload.id,
    );

    if (actor) {
      await db.auditLog.create({
        data: {
          adminId: actor.id,
          action: 'updated',
          module: 'blog',
          description:
            `${actor.firstName} ${actor.lastName} updated blog post "${updated.title}"`,
          severity: 'info',
          metadata: JSON.stringify({
            blogId: updated.id,
            slug: updated.slug,
            changedFields: Object.keys(data),
          }),
        },
      });
    }

    return NextResponse.json({
      post: updated,
    });
  } catch (error) {
    console.error(
      'Update blog post API error:',
      error,
    );

    return NextResponse.json(
      { error: 'Failed to update blog post' },
      { status: 500 },
    );
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    // v50 — mandatory auth gate.
    // No body.adminId fallback is permitted.
    const authResult = await requireRole(
      req,
      ['super', 'admin'],
    );

    if (authResult instanceof NextResponse) {
      return authResult;
    }

    const authPayload = authResult;

    // Actor identity comes exclusively from the verified JWT.
    const adminId = authPayload.id;

    const { id } = await params;

    const existing = await db.blog.findUnique({
      where: { id },
      select: {
        id: true,
        title: true,
        slug: true,
      },
    });

    if (!existing) {
      return NextResponse.json(
        { error: 'Post not found' },
        { status: 404 },
      );
    }

    await db.blog.delete({
      where: { id },
    });

    // ------------------------------------------------------------
    // Audit log
    // Actor always comes from the verified JWT.
    // ------------------------------------------------------------
    const actor = await getActor(adminId);

    if (actor) {
      await db.auditLog.create({
        data: {
          adminId: actor.id,
          action: 'deleted',
          module: 'blog',
          description:
            `${actor.firstName} ${actor.lastName} deleted blog post "${existing.title}"`,
          severity: 'warning',
          metadata: JSON.stringify({
            blogId: existing.id,
            slug: existing.slug,
          }),
        },
      });
    }

    return NextResponse.json({
      ok: true,
      id,
    });
  } catch (error) {
    console.error(
      'Delete blog post API error:',
      error,
    );

    return NextResponse.json(
      { error: 'Failed to delete blog post' },
      { status: 500 },
    );
  }
}