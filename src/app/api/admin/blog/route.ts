import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';

/**
 * /api/admin/blog
 *
 * GET  — list all blog posts (paginated: ?page=&limit=)
 * POST — create a new blog post
 *        Body: { adminId, title, slug?, body, image?, categoryId?, status }
 *        - Auto-generates a slug from the title if not provided.
 *        - Sets authorId = adminId
 *        - Strips all secrets from every response.
 */

function slugify(input: string): string {
  return input
    .toString()
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '') // strip non alphanumerics
    .replace(/\s+/g, '-') // whitespace → dash
    .replace(/-+/g, '-') // collapse dashes
    .replace(/^-|-$/g, ''); // trim leading/trailing dash
}

async function ensureUniqueSlug(base: string, excludeId?: string): Promise<string> {
  const seed = base || 'post';
  let slug = seed;
  let n = 1;
  // Loop until we find a slug not used by another post
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

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
    const limit = Math.max(1, Math.min(100, parseInt(searchParams.get('limit') || '20', 10)));

    const [posts, total] = await Promise.all([
      db.blog.findMany({
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
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
      }),
      db.blog.count(),
    ]);

    // Body is potentially large — return everything; consumer can trim if needed.
    return NextResponse.json({
      posts,
      page,
      limit,
      total,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  } catch (e: any) {
    console.error('Admin blog list API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const authPayload = getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    const body = await req.json();

    if (!body.title || !body.body) {
      return NextResponse.json(
        { error: 'Title and body are required' },
        { status: 400 }
      );
    }

    const adminId = authPayload.id;

    // Verify the admin exists (optional — fail soft if missing)
    let author: any = null;
    if (adminId) {
      author = await db.admin.findUnique({
        where: { id: adminId },
        select: { id: true, firstName: true, lastName: true, role: true },
      });
    }

    // Resolve slug
    const baseSlug = body.slug?.trim()
      ? slugify(body.slug)
      : slugify(body.title);
    const slug = await ensureUniqueSlug(baseSlug);

    // Resolve category if provided
    let categoryId: string | null = null;
    if (body.categoryId) {
      const cat = await db.category.findUnique({
        where: { id: body.categoryId },
        select: { id: true },
      });
      if (cat) categoryId = cat.id;
    }

    const status = body.status === 'published' ? 'published' : 'draft';

    const post = await db.blog.create({
      data: {
        title: body.title.trim(),
        slug,
        body: body.body,
        image: body.image?.trim() || null,
        categoryId,
        authorId: author?.id || null,
        status,
      },
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
    if (author) {
      await db.auditLog.create({
        data: {
          adminId: author.id,
          action: 'created',
          module: 'blog',
          description: `${author.firstName} ${author.lastName} created blog post "${post.title}"`,
          severity: 'info',
          metadata: JSON.stringify({
            blogId: post.id,
            slug: post.slug,
            status: post.status,
          }),
        },
      });
    }

    // Blog table has no secrets — return as-is.
    return NextResponse.json({ post }, { status: 201 });
  } catch (e: any) {
    console.error('Create blog post API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
