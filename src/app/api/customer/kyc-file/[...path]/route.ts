import { NextRequest, NextResponse } from 'next/server';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { db } from '@/lib/db';
import { getAuthFromRequest } from '@/lib/auth';
import { get } from '@vercel/blob';

// ============================================================================
// GET /api/customer/kyc-file/[...path]
// Authorization: Bearer <customer-jwt>
//
// v50 â€” Authenticated proxy for serving KYC documents. The blob URL is
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
    // Customers may read only their own files. KYC reviewers may read the
    // customer's referenced KYC documents through the same private proxy.
    const authPayload = await getAuthFromRequest(req);
    if (!authPayload) return NextResponse.json({ error: 'Authentication required' }, { status: 401 });

    const { path } = await params;
    const fullPath = path.join('/');
    const parts = fullPath.split('/');
    const pathUserId = parts[0];
    if (!pathUserId) return NextResponse.json({ error: 'Invalid file path' }, { status: 400 });

    const isCustomer = authPayload.type === 'customer';
    const reviewerRole = ['super', 'cs', 'compliance'].includes(authPayload.role);
    if (!isCustomer && !reviewerRole) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    if (isCustomer && pathUserId !== authPayload.id) {
      return NextResponse.json({ error: 'Forbidden: file does not belong to authenticated customer.' }, { status: 403 });
    }

    const user = await db.user.findUnique({
      where: { id: pathUserId },
      select: { id: true, businessId: true, branchId: true },
    });
    if (!user) return NextResponse.json({ error: 'Customer not found.' }, { status: 404 });
    if (authPayload.role === 'cs' && authPayload.branchId && user.branchId &&
        authPayload.branchId !== user.branchId) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const proxyPath = `/api/customer/kyc-file/${fullPath}`;
    const uploadId = parts.length === 2 ? parts[1] : null;

    // v54 — NEW ONBOARDING UPLOADS
    // New onboarding documents are stored as private blobs under the
    // onboarding session path. The client only receives a proxy path containing
    // the opaque OnboardingUpload ID. Resolve the real storagePath server-side.
    let onboardingUpload: {
      id: string;
      storagePath: string;
      originalName: string | null;
      mimeType: string | null;
    } | null = null;

    if (uploadId) {
      onboardingUpload = await db.onboardingUpload.findFirst({
        where: {
          id: uploadId,
          userId: pathUserId,
        },
        select: {
          id: true,
          storagePath: true,
          originalName: true,
          mimeType: true,
        },
      });
    }

    if (onboardingUpload) {
      const filename = onboardingUpload.originalName || uploadId || 'kyc-document';

      if (!process.env.BLOB_READ_WRITE_TOKEN) {
        return NextResponse.json(
          { error: 'Private document storage is not configured.' },
          { status: 503 },
        );
      }

      try {
        const result = await get(onboardingUpload.storagePath, { access: 'private' });

        if (!result || result.statusCode !== 200) {
          return NextResponse.json(
            { error: 'File not found in blob storage.' },
            { status: 404 },
          );
        }

        const reader = result.stream.getReader();
        const chunks: Uint8Array[] = [];

        // eslint-disable-next-line no-constant-condition
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) chunks.push(value);
        }

        const buf = Buffer.concat(chunks);
        const contentType =
          onboardingUpload.mimeType ||
          result.blob.contentType ||
          'application/octet-stream';

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
        console.error('[KYC-FILE] onboarding blob fetch failed:', blobErr?.message);
        return NextResponse.json(
          { error: 'File not found in blob storage.' },
          { status: 404 },
        );
      }
    }

    // Legacy KYC files remain supported. Their proxy path must still be
    // explicitly referenced by the customer's Business KYC fields.
    if (!user?.businessId) {
      return NextResponse.json({ error: 'No business record on file.' }, { status: 404 });
    }

    const business = await db.business.findUnique({
      where: { id: user.businessId },
      select: ['selfie', 'docFront', 'docBack', 'proofOfAddress', 'docShopPhoto', 'docCac'].reduce((acc: any, c) => {
        acc[c] = true; return acc;
      }, {}),
    });

    const referenced = business && Object.values(business).some(v => v === proxyPath);

    if (!referenced) {
      return NextResponse.json(
        { error: 'File not referenced by any of your KYC records.' },
        { status: 404 },
      );
    }

    // --- Stream legacy file ----------------------------------------------
    // Legacy production files are stored at kyc-private/{userId}/{filename}.
    const filename = parts.slice(1).join('/');

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      const blobName = `kyc-private/${fullPath}`;
      try {
        const result = await get(blobName, { access: 'private' });
        if (!result || result.statusCode !== 200) {
          return NextResponse.json({ error: 'File not found in blob storage.' }, { status: 404 });
        }
        // Convert the readable stream into a Buffer for the response.
        const reader = result.stream.getReader();
        const chunks: Uint8Array[] = [];
        // eslint-disable-next-line no-constant-condition
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
      const tmpPath = join('/tmp', 'uploads', 'kyc-private', pathUserId, filename);
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
