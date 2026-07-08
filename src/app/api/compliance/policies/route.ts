import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);
    const status = url.searchParams.get('status');
    const category = url.searchParams.get('category');

    const where: any = {};
    if (status && status !== 'all') where.status = status;
    if (category && category !== 'all') where.category = category;

    const policies = await db.policyDocument.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        _count: { select: { acknowledgments: true } },
      },
    });

    return NextResponse.json({ policies });
  } catch (e: any) {
    console.error('List policies API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const title = String(formData.get('title') || '');
    const category = String(formData.get('category') || 'general');
    const version = String(formData.get('version') || '1.0');
    const effectiveDate = formData.get('effectiveDate')
      ? new Date(String(formData.get('effectiveDate')))
      : new Date();
    const body = String(formData.get('body') || '');
    const createdBy = String(formData.get('createdBy') || '');

    let filePath: string | null = null;
    const file = formData.get('file') as File | null;
    if (file && file.size > 0) {
      filePath = `/uploads/policies/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    }

    if (!title) {
      return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    }

    const policy = await db.policyDocument.create({
      data: {
        title,
        category,
        version,
        effectiveDate,
        body,
        filePath,
        createdBy: createdBy || null,
        status: 'active',
      },
    });

    return NextResponse.json({ policy });
  } catch (e: any) {
    console.error('Create policy API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
