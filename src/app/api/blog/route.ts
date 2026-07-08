import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/blog — all published posts, newest first
export async function GET() {
  try {
    const posts = await db.blog.findMany({
      where: { status: 'published' },
      orderBy: { createdAt: 'desc' },
    });

    // Strip very large body content for the listing endpoint
    const slim = posts.map((p) => ({
      id: p.id,
      title: p.title,
      slug: p.slug,
      image: p.image,
      excerpt: p.body?.replace(/<[^>]+>/g, ' ').slice(0, 180).trim() + '…',
      body: p.body,
      views: p.views,
      createdAt: p.createdAt,
    }));

    return NextResponse.json({ blogs: slim });
  } catch (e: any) {
    console.error('Blog list API error:', e);
    return NextResponse.json({ blogs: [] });
  }
}
