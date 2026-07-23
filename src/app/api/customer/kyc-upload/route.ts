import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { put } from '@vercel/blob';

// ============================================================================
// POST /api/customer/kyc-upload
// Multipart form-data upload for KYC documents during onboarding.
//
// v43: Now uses Vercel Blob for production (persistent, CDN-backed URLs).
// Falls back to /tmp for local development (ephemeral but functional).
// Previously wrote to /public/uploads/kyc/ which is READ-ONLY on Vercel.
//
// Body (multipart):
//   userId: string
//   docType: 'passport' | 'id_front' | 'proof_of_address' |
//            'cac_certificate' | 'means_of_id'
//   file: File (image/* or application/pdf, max 10MB)
//
// Returns: { path, docType, originalName, size }
// ============================================================================

const ALLOWED_TYPES: Record<string, string[]> = {
  passport: ['image/jpeg', 'image/png', 'image/webp'],
  id_front: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  proof_of_address: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  cac_certificate: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  means_of_id: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// Map docType → Business column
const DOC_COLUMN_MAP: Record<string, string> = {
  passport: 'selfie',
  id_front: 'docFront',
  proof_of_address: 'proofOfAddress',
  cac_certificate: 'docCac',
  means_of_id: 'docFront',
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const userId = formData.get('userId') as string;
    const docType = formData.get('docType') as string;
    const file = formData.get('file') as File | null;

    if (!userId) {
      return NextResponse.json({ error: 'userId is required' }, { status: 400 });
    }
    if (!docType || !ALLOWED_TYPES[docType]) {
      return NextResponse.json(
        { error: `Invalid docType. Allowed: ${Object.keys(ALLOWED_TYPES).join(', ')}` },
        { status: 400 }
      );
    }
    if (!file) {
      return NextResponse.json({ error: 'file is required' }, { status: 400 });
    }

    // v43: Also accept empty MIME type (some browsers send empty type for PNG)
    const allowedMimes = ALLOWED_TYPES[docType];
    const fileType = file.type || detectMimeType(file.name);
    if (!allowedMimes.includes(fileType)) {
      // If MIME type is empty or unrecognized, try to detect from filename
      if (!file.type && allowedMimes.includes(detectMimeType(file.name))) {
        // OK — proceed with detected type
      } else {
        return NextResponse.json(
          { error: `File type "${file.type || 'unknown'}" not allowed for ${docType}. Allowed: ${allowedMimes.join(', ')}` },
          { status: 400 }
        );
      }
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size: 10MB. Received: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const safeName = `${randomUUID()}-${docType}.${ext}`;

    // ── v43: Upload to Vercel Blob (production) or /tmp (local dev) ────────
    let relativePath: string;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      // Production: use Vercel Blob
      const blob = await put(`kyc/${safeName}`, file, {
        access: 'public',
        addRandomSuffix: false,
      });
      relativePath = blob.url;
    } else {
      // Local dev fallback: write to /tmp (writable on all platforms)
      const tmpDir = join('/tmp', 'uploads', 'kyc');
      await mkdir(tmpDir, { recursive: true });
      const tmpPath = join(tmpDir, safeName);
      const bytes = await file.arrayBuffer();
      await writeFile(tmpPath, Buffer.from(bytes));
      // Return a relative path that the dev server can serve via a rewrite
      relativePath = `/uploads/kyc/${safeName}`;
    }

    // Persist the path on the Business record (only if user has a business)
    const column = DOC_COLUMN_MAP[docType];
    if (userId !== 'pending') {
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
    }

    try {
      await db.auditLog.create({
        data: {
          userId: userId !== 'pending' ? userId : undefined,
          action: 'kyc_doc_uploaded',
          module: 'kyc',
          description: `KYC document uploaded: ${docType} (${file.name}, ${file.size} bytes)${userId === 'pending' ? ' [pending user]' : ''}`,
          severity: 'info',
          metadata: JSON.stringify({ docType, path: relativePath, originalName: file.name, size: file.size, pendingUser: userId === 'pending' }),
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
