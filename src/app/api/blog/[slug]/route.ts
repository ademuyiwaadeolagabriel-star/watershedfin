import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/blog/[slug] — single published post by slug
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  try {
    const { slug } = await params;
    const post = await db.blog.findUnique({
      where: { slug },
    });

    if (!post || post.status !== 'published') {
      return NextResponse.json(
        { error: 'Post not found.' },
        { status: 404 }
      );
    }

    // Bump view count (fire and forget)
    db.blog
      .update({ where: { id: post.id }, data: { views: (post.views || 0) + 1 } })
      .catch(() => {});

    return NextResponse.json({ blog: post });
  } catch (e: any) {
    console.error('Blog detail API error:', e);
    return NextResponse.json(
      { error: 'Could not load blog post.' },
      { status: 500 }
    );
  }
}
