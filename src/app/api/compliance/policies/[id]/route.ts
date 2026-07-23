import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const policy = await db.policyDocument.findUnique({
      where: { id },
      include: {
        acknowledgments: {
          orderBy: { acknowledgedAt: 'desc' },
          take: 100,
        },
      },
    });
    if (!policy) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ policy });
  } catch (e: any) {
    console.error('Get policy API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const body = await req.json();
    const allowed = ['title', 'category', 'version', 'effectiveDate', 'body', 'status', 'filePath'];
    const data: any = {};
    for (const k of allowed) {
      if (k in body) data[k] = body[k];
    }
    const policy = await db.policyDocument.update({ where: { id }, data });
    return NextResponse.json({ policy });
  } catch (e: any) {
    console.error('Update policy API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    await db.policyDocument.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error('Delete policy API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
