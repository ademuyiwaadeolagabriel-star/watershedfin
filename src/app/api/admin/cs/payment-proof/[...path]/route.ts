import { NextRequest, NextResponse } from 'next/server';
import { getAuthFromRequest } from '@/lib/auth';
import { db } from '@/lib/db';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { get } from '@vercel/blob';

export async function GET(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const auth = await getAuthFromRequest(req);
  if (!auth) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  if (!['super', 'cs', 'compliance'].includes(auth.role)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const parts = (await params).path || [];
  const objectName = parts.join('/');
  if (!objectName || objectName.includes('..')) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  const proxyPath = `/api/admin/cs/payment-proof/${objectName}`;

  const payment = await db.onboardingPayment.findFirst({
    where: { proofOfPaymentPath: proxyPath },
    select: { proofOfPaymentPath: true },
  });
  if (!payment) return NextResponse.json({ error: 'File not found' }, { status: 404 });

  if (process.env.BLOB_READ_WRITE_TOKEN) {
    try {
      const result = await get(`payment-proofs/${objectName}`, { access: 'private' });
      if (!result || result.statusCode !== 200) return NextResponse.json({ error: 'File not found' }, { status: 404 });
      const reader = result.stream.getReader();
      const chunks: Uint8Array[] = [];
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) chunks.push(value);
      }
      return new NextResponse(Buffer.concat(chunks), {
        status: 200,
        headers: {
          'Content-Type': result.blob.contentType || 'application/octet-stream',
          'Content-Disposition': 'inline',
          'Cache-Control': 'private, no-store, max-age=0',
          'X-Content-Type-Options': 'nosniff',
        },
      });
    } catch {
      return NextResponse.json({ error: 'File not found' }, { status: 404 });
    }
  }

  const [userId, filename] = objectName.split('/');
  if (!userId || !filename) return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  try {
    const filePath = join('/tmp', 'uploads', 'payment-proofs', userId, filename);
    const data = await readFile(filePath);
    const ext = filename.split('.').pop()?.toLowerCase();
    const mime = ext === 'pdf' ? 'application/pdf' : ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
    return new NextResponse(data, {
      status: 200,
      headers: {
        'Content-Type': mime,
        'Content-Disposition': 'inline',
        'Cache-Control': 'private, no-store, max-age=0',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
