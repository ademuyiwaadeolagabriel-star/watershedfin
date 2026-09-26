import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '@/lib/db';
import { requireCustomerAuth } from '@/lib/auth';
import { get } from '@vercel/blob';

// ============================================================================
// GET /api/customer/kyc-file/[...path]
// Authorization: Bearer <customer-jwt>
//
// v50 — Authenticated proxy for serving KYC documents. The blob URL is
// NEVER exposed to the client; only the proxy path is stored on the
// Business record. Reads are gated behind:
//   1. requireCustomerAuth (caller must be a customer with a valid JWT)
//   2. Ownership check: the path's first segment must equal the caller's
//      userId, AND a Business row must exist whose doc column matches
//      this path AND whose owner is the caller.
//
// This closes the v49 KYC privacy + IDOR gap where sensitive identity
// documents were accessible via public Blob URLs.
// ============================================================================

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    // --- Auth gate: customer JWT mandatory -------------------------------
    const authResult = await requireCustomerAuth(req);
    if (authResult instanceof NextResponse) return authResult;
    const authPayload = authResult as { id: string; type: string };
    const userId = authPayload.id;

    const { path } = await params;
    const fullPath = path.join('/');

    // --- Ownership check: first path segment must match the caller -------
    // (The upload route wrote files under kyc-private/{userId}/... or
    // proxy path /api/customer/kyc-file/{userId}/...).
    const parts = fullPath.split('/');
    const pathUserId = parts[0];
    if (!pathUserId || pathUserId !== userId) {
      return NextResponse.json(
        { error: 'Forbidden: file does not belong to authenticated customer.' },
        { status: 403 },
      );
    }

    // Double-check via DB: at least one Business column owned by the user
    // must reference this proxy path. This prevents a customer from
    // path-traversing to a file they did upload once but later removed.
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { businessId: true },
    });
    if (!user?.businessId) {
      return NextResponse.json({ error: 'No business record on file.' }, { status: 404 });
    }
    const business = await db.business.findUnique({
      where: { id: user.businessId },
      select: ['selfie', 'docFront', 'proofOfAddress', 'docCac'].reduce((acc: any, c) => {
        acc[c] = true; return acc;
      }, {}),
    });
    const proxyPath = `/api/customer/kyc-file/${fullPath}`;
    const referenced = business && Object.values(business).some(v => v === proxyPath);
    if (!referenced) {
      return NextResponse.json(
        { error: 'File not referenced by any of your KYC records.' },
        { status: 404 },
      );
    }

    // --- Stream the file --------------------------------------------------
    // In dev: read from /tmp/uploads/kyc-private/{userId}/{filename}
    // In prod: fetch from Vercel Blob at kyc-private/{userId}/{filename}
    const filename = parts.slice(1).join('/'); // everything after userId

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Fetch the private blob via Vercel Blob SDK. The `get()` function
      // requires `access: 'private'` and streams the bytes back.
      const blobName = `kyc-private/${fullPath}`;
      try {
        const result = await get(blobName, { access: 'private' });
        if (!result || result.statusCode !== 200) {
          return NextResponse.json({ error: 'File not found in blob storage.' }, { status: 404 });
        }
        // Convert the readable stream into a Buffer for the response.
        const reader = result.stream.getReader();
        const chunks: Uint8Array[] = [];
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }
        const buf = Buffer.concat(chunks);
        const contentType = result.blob.contentType || 'application/octet-stream';
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch (blobErr: any) {
        console.error('[KYC-FILE] blob fetch failed:', blobErr?.message);
        return NextResponse.json({ error: 'File not found in blob storage.' }, { status: 404 });
      }
    } else {
      // Dev: read from /tmp.
      const tmpPath = join('/tmp', 'uploads', 'kyc-private', userId, filename);
      try {
        const buf = await readFile(tmpPath);
        const ext = filename.split('.').pop()?.toLowerCase();
        const mimeMap: Record<string, string> = {
          png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
          webp: 'image/webp', pdf: 'application/pdf', gif: 'image/gif',
        };
        const contentType = mimeMap[ext || ''] || 'application/octet-stream';
        return new NextResponse(buf, {
          status: 200,
          headers: {
            'Content-Type': contentType,
            'Content-Disposition': `inline; filename="${filename}"`,
            'Cache-Control': 'private, no-store, max-age=0',
            'X-Content-Type-Options': 'nosniff',
          },
        });
      } catch {
        return NextResponse.json({ error: 'File not found on disk.' }, { status: 404 });
      }
    }
  } catch (e: any) {
    console.error('[KYC-FILE] error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
