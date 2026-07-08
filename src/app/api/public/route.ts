import { NextResponse } from 'next/server';
import { db } from '@/lib/db';

// GET /api/public — returns all public-facing content from the database
export async function GET() {
  try {
    const [settings, services, reviews, brands, team, blogs, pages] = await Promise.all([
      db.settings.findFirst().catch(() => null),
      db.service.findMany({ where: { status: true }, orderBy: { createdAt: 'asc' } }).catch(() => []),
      db.review.findMany({ where: { status: true }, orderBy: { createdAt: 'desc' }, take: 6 }).catch(() => []),
      db.brand.findMany({ where: { status: true } }).catch(() => []),
      db.team.findMany({ orderBy: { createdAt: 'asc' } }).catch(() => []),
      db.blog.findMany({ where: { status: 'published' }, orderBy: { createdAt: 'desc' }, take: 3, include: { category: true } }).catch(() => []),
      db.page.findMany({ where: { status: 'published' } }).catch(() => []),
    ]);

    return NextResponse.json({
      settings: settings ? {
        ...settings,
        password: undefined,
        token: undefined,
        tokenExpired: undefined,
        twilioAuthToken: undefined,
        nocaptchaSecret: undefined,
        googleCs: undefined,
        facebookCs: undefined,
      } : null,
      services,
      reviews,
      brands,
      team,
      blogs: blogs.map((b: any) => ({ ...b, body: undefined })),
      pages,
    });
  } catch (e: any) {
    console.error('Public API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
