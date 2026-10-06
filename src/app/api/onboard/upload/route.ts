import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { put } from '@vercel/blob';
import { db } from '@/lib/db';

const MAX_FILE_SIZE = 10 * 1024 * 1024;

const ALLOWED: Record<string, string[]> = {
  passport: ['image/jpeg', 'image/png', 'image/webp'],
  id_front: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  proof_of_address: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  cac_certificate: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  means_of_id: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
  additional_docs: ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'],
};

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeFileName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-120);
}

export async function POST(req: NextRequest) {
  try {
    const form = await req.formData();

    const file = form.get('file');
    const docType = String(form.get('docType') || '').trim();
    const channel = String(form.get('channel') || '').trim();
    const sessionToken = String(form.get('sessionToken') || '').trim();

    if (!(file instanceof File)) {
      return NextResponse.json({ error: 'A file is required.' }, { status: 400 });
    }

    if (!docType || !channel || !sessionToken) {
      return NextResponse.json(
        { error: 'docType, channel and sessionToken are required.' },
        { status: 400 }
      );
    }

    if (!ALLOWED[docType]) {
      return NextResponse.json(
        { error: 'Unsupported document type.' },
        { status: 400 }
      );
    }

    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json(
        { error: 'File must be greater than 0 bytes and no larger than 10 MB.' },
        { status: 400 }
      );
    }

    if (!ALLOWED[docType].includes(file.type)) {
      return NextResponse.json(
        { error: `Unsupported file type for ${docType}.` },
        { status: 400 }
      );
    }

    const session = await db.onboardingUploadSession.findUnique({
      where: {
        sessionTokenHash: hashToken(sessionToken),
      },
      select: {
        id: true,
        channel: true,
        expiresAt: true,
        consumedAt: true,
      },
    });

    if (
      !session ||
      session.channel !== channel ||
      session.consumedAt ||
      session.expiresAt <= new Date()
    ) {
      return NextResponse.json(
        { error: 'Invalid or expired onboarding upload session.' },
        { status: 401 }
      );
    }

    if (!process.env.BLOB_READ_WRITE_TOKEN) {
      return NextResponse.json(
        { error: 'Private document storage is not configured.' },
        { status: 503 }
      );
    }

    const ext = file.name.includes('.')
      ? file.name.substring(file.name.lastIndexOf('.')).toLowerCase()
      : '';

    const storageName =
      `kyc-private/onboarding/${session.id}/${crypto.randomUUID()}${ext}`;

    const blob = await put(storageName, file, {
      access: 'private',
      addRandomSuffix: false,
      contentType: file.type || undefined,
    });

    const upload = await db.onboardingUpload.create({
      data: {
        sessionId: session.id,
        docType,
        storagePath: blob.pathname,
        originalName: safeFileName(file.name),
        mimeType: file.type || null,
        sizeBytes: file.size,
      },
      select: {
        id: true,
        docType: true,
      },
    });

    return NextResponse.json({
      success: true,
      uploadId: upload.id,
      docType: upload.docType,
    });
  } catch (error) {
    console.error('[onboard/upload] error', error);

    return NextResponse.json(
      { error: 'Unable to upload onboarding document.' },
      { status: 500 }
    );
  }
}
