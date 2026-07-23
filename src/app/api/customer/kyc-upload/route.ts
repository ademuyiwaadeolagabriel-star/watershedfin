import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { writeFile, mkdir } from 'fs/promises';
import { join } from 'path';
import { randomUUID } from 'crypto';

// ============================================================================
// POST /api/customer/kyc-upload
// Multipart form-data upload for KYC documents during onboarding.
//
// v41: Replaces the previous "demo-only" file inputs in the onboarding form.
// Files are saved to /public/uploads/kyc/{uuid}-{originalname} and the path
// is stored on the Business record (docFront, docBack, proofOfAddress,
// docShopPhoto, docCac, selfie) so CS staff can view them in the KYC queue.
//
// Body (multipart):
//   userId: string
//   docType: 'passport' | 'id_front' | 'id_back' | 'proof_of_address' |
//            'shop_photo' | 'cac_certificate' | 'means_of_id'
//   file: File (image/* or application/pdf, max 10MB)
//
// Returns: { path, docType, originalName, size }
// ============================================================================

const ALLOWED_TYPES: Record<string, string[]> = {
  passport: ['image/jpeg', 'image/png', 'image/webp'],
  id_front: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  id_back: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  proof_of_address: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  shop_photo: ['image/jpeg', 'image/png', 'image/webp'],
  cac_certificate: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  means_of_id: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

// Map docType → Business column
const DOC_COLUMN_MAP: Record<string, string> = {
  passport: 'selfie',
  id_front: 'docFront',
  id_back: 'docBack',
  proof_of_address: 'proofOfAddress',
  shop_photo: 'docShopPhoto',
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

    const allowedMimes = ALLOWED_TYPES[docType];
    if (!allowedMimes.includes(file.type)) {
      return NextResponse.json(
        { error: `File type ${file.type} not allowed for ${docType}. Allowed: ${allowedMimes.join(', ')}` },
        { status: 400 }
      );
    }

    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: `File too large. Max size: 10MB. Received: ${(file.size / 1024 / 1024).toFixed(2)}MB` },
        { status: 400 }
      );
    }

    const ext = file.name.split('.').pop()?.toLowerCase() || 'bin';
    const safeName = `${randomUUID()}-${docType}.${ext}`;
    const relativePath = `/uploads/kyc/${safeName}`;
    const absolutePath = join(process.cwd(), 'public', 'uploads', 'kyc', safeName);

    await mkdir(join(process.cwd(), 'public', 'uploads', 'kyc'), { recursive: true });

    const bytes = await file.arrayBuffer();
    await writeFile(absolutePath, Buffer.from(bytes));

    const column = DOC_COLUMN_MAP[docType];

    // v41: Support 'pending' userId for pre-submit uploads during onboarding.
    // The file is saved; the Business record is updated after user creation
    // by the onboarding API.
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
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
