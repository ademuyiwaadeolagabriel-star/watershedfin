import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    let filePath: string | null = null;
    if (file && file.size > 0) {
      filePath = `/uploads/logos/${Date.now()}-${file.name.replace(/\s+/g, '-')}`;
    }

    // Store path in settings (reuse brandColorDark field? Better: store in careerUrl or just return path)
    // For demo we just return the path; client can use it directly.
    return NextResponse.json({ ok: true, filePath, fileName: file?.name || '' });
  } catch (e: any) {
    console.error('Logo upload API error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
