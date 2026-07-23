import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';

// Dev-only endpoint to serve uploaded KYC files from /tmp
// In production, Vercel Blob serves files directly via CDN URLs
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available in production' }, { status: 404 });
  }
  const { searchParams } = new URL(req.url);
  const path = searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path required' }, { status: 400 });
  }
  // Prevent path traversal
  if (path.includes('..')) {
    return NextResponse.json({ error: 'Invalid path' }, { status: 400 });
  }
  const filePath = join('/tmp', 'uploads', 'kyc', path);
  try {
    const buffer = await readFile(filePath);
    // Detect content type from extension
    const ext = path.split('.').pop()?.toLowerCase();
    const contentType =
      ext === 'png' ? 'image/png' :
      ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg' :
      ext === 'webp' ? 'image/webp' :
      ext === 'pdf' ? 'application/pdf' :
      'application/octet-stream';
    return new NextResponse(buffer, {
      headers: { 'Content-Type': contentType },
    });
  } catch {
    return NextResponse.json({ error: 'File not found' }, { status: 404 });
  }
}
