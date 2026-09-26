import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';
import { requireCustomerAuth } from '@/lib/auth';

// ============================================================================
// POST /api/customer/kyc-upload
// Authorization: Bearer <customer-jwt>
// multipart/form-data: { docType, file }
//
// v50 FIXES (Issues #8, #9):
//   - Customer identity comes from the JWT, NOT from `body.userId` /
//     formData.get('userId'). Previously a customer authenticated as
//     themselves could supply another user's userId and overwrite that
//     user's KYC documents — an IDOR allowing document destruction /
//     tampering with another customer's identity evidence.
//   - Vercel Blob: when BLOB_READ_WRITE_TOKEN is set, files are now stored
//     at a path that is NOT publicly listed. The v49 code said
//     `access: 'public'` with a comment claiming "Note: Vercel Blob
//     doesn't support 'private' on free tier" — that was a
//     misunderstanding: the @vercel/blob SDK absolutely supports private
//     access (the blob is created unlisted and only readable through a
//     signed download URL). The v50 implementation uses an authenticated
//     proxy endpoint (`/api/customer/kyc-file/[name]`) to gate reads
//     behind requireCustomerAuth + ownership check. In production we
//     recommend migrating to S3 / GCS with proper signed URLs, but the
//     proxy approach is a sufficient stop-gap because the blob URL
//     itself is never exposed to the customer UI — only the proxy path
//     is stored on the Business record.
// ============================================================================

const ALLOWED_TYPES: Record<string, string[]> = {
  passport: ['image/jpeg', 'image/png', 'image/webp'],
  id_front: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  proof_of_address: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  cac_certificate: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  means_of_id: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

const DOC_COLUMN_MAP: Record<string, string> = {
  passport: 'selfie',
  id_front: 'docFront',
  proof_of_address: 'proofOfAddress',
  cac_certificate: 'docCac',
  means_of_id: 'docFront',
};

export async function POST(req: NextRequest) {
  // v50 — Auth gate: customer JWT mandatory.
  const authResult = await requireCustomerAuth(req);
  if (authResult instanceof NextResponse) return authResult;
  const authPayload = authResult as { id: string; type: string };
  const userId = authPayload.id; // v50 — derived from JWT

  try {
    const formData = await req.formData();
    // v50 — userId is NOT read from the form. Identity comes from the JWT.
    const docType = formData.get('docType') as string;
    const file = formData.get('file') as File | null;

    if (!docType || !ALLOWED_TYPES[docType]) {
      return NextResponse.json(
        { error: `Invalid docType. Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}` },
        { status: 400 },
      );
    }
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    const fileType = file.type || detectMimeType(file.name);
    const allowedMimes = ALLOWED_TYPES[docType];
    if (!allowedMimes.includes(fileType)) {
      if (!(!file.type && allowedMimes.includes(detectMimeType(file.name)))) {
        return NextResponse.json(
          { error: `File type "${file.type || 'unknown'}" not allowed for ${docType}. Allowed: ${allowedMimes.join(', ')}` },
          { status: 400 },
        );
      }
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size: 10MB. Received: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 },
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    // Include the userId in the path for ownership-check convenience at
    // read time (the proxy endpoint can read the userId segment and
    // confirm it matches the JWT subject before serving bytes).
    const safeName = `${userId}/${randomUUID()}-${docType}.${ext}`;

    // v50 — Store via AUTHENTICATED PROXY path, not a public blob URL.
    // - Local dev: write to /tmp/uploads/kyc-private/{userId}/{filename}
    //   served via /api/customer/kyc-file/{userId}/{filename}
    // - Production (BLOB_READ_WRITE_TOKEN set): use Vercel Blob. The blob
    //   itself is created without `access: 'public'` so its URL is not
    //   publicly listable. We persist only the PROXY path on the
    //   Business record so the blob URL is never exposed to the customer.
    let relativePath: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production: store at Vercel Blob but route reads through the
      // authenticated proxy. The proxy will look up the blob by name
      // and stream it to the (authenticated, ownership-verified) caller.
      // The blob's own URL is never returned to the client.
      await put(`kyc-private/${safeName}`, file, {
        // v50 — `access: 'private'` IS supported by @vercel/blob. The v49
        // code used `access: 'public'` with a misleading comment claiming
        // "Vercel Blob doesn't support 'private' on free tier" — that was
        // incorrect. With 'private' the blob is created unlisted and only
        // readable through the authenticated proxy endpoint.
        access: 'private',
        addRandomSuffix: false,
        contentType: file.type || undefined,
      });
      relativePath = `/api/customer/kyc-file/${safeName}`;
    } else {
      // Local dev: write to /tmp (NOT /public — biometric data must not
      // be publicly accessible even in dev).
      const tmpDir = join('/tmp', 'uploads', 'kyc-private', userId);
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, `${randomUUID()}-${docType}.${ext}`);
      const bytes = await file.arrayBuffer();
      await writeFile(tmpPath, Buffer.from(bytes));
      relativePath = `/api/customer/kyc-file/${userId}/${tmpPath.split('/').pop()}`;
    }

    // Persist the proxy path on the Business record.
    const column = DOC_COLUMN_MAP[docType];
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, businessId: true },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    if (user.businessId) {
      await db.business.update({
        where: { id: user.businessId },
        data: { [column]: relativePath } as any,
      });
    }

    try {
      await db.auditLog.create({
        data: {
          userId,
          action: 'kyc_doc_uploaded',
          module: 'kyc',
          description: `KYC document uploaded: ${docType} (${file.name}, ${file.size} bytes)`,
          severity: 'info',
          metadata: JSON.stringify({ docType, path: relativePath, originalName: file.name, size: file.size }),
        },
      });
    } catch {}

    return NextResponse.json({
      path: relativePath,
      docType,
      originalName: file.name,
      size: file.size,
      column,
    });
  } catch (e: any) {
    console.error('[KYC UPLOAD] error:', e);
    return NextResponse.json({ error: e.message || 'Upload failed' }, { status: 500 });
  }
}

// Helper: detect MIME type from file extension (fallback for empty file.type)
function detectMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  switch (ext) {
    case 'png': return 'image/png';
    case 'jpg':
    case 'jpeg': return 'image/jpeg';
    case 'webp': return 'image/webp';
    case 'pdf': return 'application/pdf';
    case 'gif': return 'image/gif';
    default: return '';
  }
}
