import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { mkdir, writeFile } from 'fs/promises';
import { dirname, join } from 'path';
import { put } from '@vercel/blob';
import { db } from '@/lib/db';

const ALLOWED_TYPES: Record<string, string[]> = {
  passport: ['image/jpeg', 'image/png', 'image/webp'],
  id_front: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  proof_of_address: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  cac_certificate: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  means_of_id: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};
const MAX_SIZE = 10 * 1024 * 1024;

function detectMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();
  const types: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png',
    webp: 'image/webp', pdf: 'application/pdf',
  };
  return types[ext || ''] || '';
}

type UploadedFile = {
  docType: string;
  storagePath: string;
  originalName: string;
  size: number;
  contentType: string;
  uploadedAt: string;
};

export async function POST(req: NextRequest) {
  let storagePath: string | null = null;

  try {
    const authorization = req.headers.get('authorization') || '';
    const token = authorization.startsWith('Bearer ')
      ? authorization.slice(7).trim()
      : '';

    if (!token) {
      return NextResponse.json(
        { error: 'An onboarding upload capability is required.' },
        { status: 401 },
      );
    }

    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    const capability = await db.onboardingUploadCapability.findUnique({
      where: { capabilityToken: tokenHash },
    });

    if (!capability || capability.consumedAt || capability.expiresAt <= new Date()) {
      return NextResponse.json(
        { error: 'Upload capability is invalid, expired, or already used. Restart document upload.' },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const docType = String(formData.get('docType') || '');
    const entry = formData.get('file');

    if (!ALLOWED_TYPES[docType]) {
      return NextResponse.json({ error: 'Unsupported document type.' }, { status: 400 });
    }
    if (!entry || typeof entry === 'string') {
      return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
    }

    const file = entry as File;
    if (!file.size || file.size > Math.min(MAX_SIZE, capability.maxFileSizeBytes)) {
      return NextResponse.json({ error: 'File must be no larger than 10 MB.' }, { status: 400 });
    }

    const contentType = file.type || detectMimeType(file.name);
    if (!ALLOWED_TYPES[docType].includes(contentType)) {
      return NextResponse.json({ error: 'This file format is not allowed for the selected document.' }, { status: 400 });
    }

    const permitted = JSON.parse(capability.permittedDocTypes || '[]') as string[];
    if (!permitted.includes(docType)) {
      return NextResponse.json({ error: 'This document type is not permitted.' }, { status: 403 });
    }

    const existing = JSON.parse(capability.uploadedFiles || '[]') as UploadedFile[];
    const replacing = existing.some((item) => item.docType === docType);
    if (existing.length >= capability.maxFiles && !replacing) {
      return NextResponse.json({ error: 'Maximum number of uploaded documents reached.' }, { status: 429 });
    }

    const ext = file.name.split('.').pop()?.toLowerCase().replace(/[^a-z0-9]/g, '') || 'bin';
    const safeName = `${crypto.randomUUID()}-${docType}.${ext}`;
    storagePath = `onboarding-staging/${capability.id}/${safeName}`;

    if (process.env.BLOB_READ_WRITE_TOKEN) {
      await put(`kyc-private/${storagePath}`, file, {
        access: 'private',
        addRandomSuffix: false,
        contentType,
      });
    } else {
      const destination = join('/tmp', 'uploads', 'kyc-private', ...storagePath.split('/'));
      await mkdir(dirname(destination), { recursive: true });
      await writeFile(destination, Buffer.from(await file.arrayBuffer()));
    }

    const uploaded: UploadedFile = {
      docType,
      storagePath,
      originalName: file.name.slice(0, 255),
      size: file.size,
      contentType,
      uploadedAt: new Date().toISOString(),
    };
    const next = [...existing.filter((item) => item.docType !== docType), uploaded];

    await db.onboardingUploadCapability.update({
      where: { id: capability.id },
      data: { uploadedFiles: JSON.stringify(next) },
    });

    // This marker is for UI form state only. The registration API resolves
    // the real, private storage paths from the server-side capability record.
    return NextResponse.json({
      path: `onboarding-upload:${docType}`,
      docType,
      originalName: uploaded.originalName,
      size: uploaded.size,
    });
  } catch (error) {
    console.error('[ONBOARDING-UPLOAD] failed:', error);
    return NextResponse.json({ error: 'Secure document upload failed. Please retry.' }, { status: 500 });
  }
}