import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import crypto from 'crypto';

// ============================================================================
// POST /api/onboarding/upload-capability
// Body: { email?, phone?, bvn? }
//
// v5 Phase 0 — Issues a scoped, expiring onboarding upload capability token.
// This allows self-onboarding customers to upload KYC documents BEFORE
// they have a customer JWT. The capability is:
//   - bound to the onboarding attempt (email+phone+bvn hash)
//   - limited to KYC document types
//   - 30-minute expiry
//   - max 5 files, 10MB each
//   - consumed when the onboarding account is created
//
// This does NOT grant general customer API access. The capability only
// works with /api/onboarding/upload (the dedicated upload endpoint).
// ============================================================================

const ALLOWED_DOC_TYPES = ['passport', 'id_front', 'proof_of_address', 'cac_certificate', 'means_of_id'];
const CAPABILITY_EXPIRY_MINUTES = 30;
const MAX_FILES = 5;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const { email, phone, bvn } = body || {};

    // Require at least one identifier to bind the capability to
    if (!email && !phone && !bvn) {
      return NextResponse.json(
        { error: 'At least one of email, phone, or bvn is required to issue an upload capability.' },
        { status: 400 },
      );
    }

    // Create the onboarding key — a hash of the provided identifiers
    const onboardingKey = crypto
      .createHash('sha256')
      .update(`${email || ''}|${phone || ''}|${bvn || ''}`)
      .digest('hex');

    // Check for an existing active capability (prevent spamming)
    const existing = await db.onboardingUploadCapability.findFirst({
      where: {
        onboardingKey,
        consumedAt: null,
        expiresAt: { gt: new Date() },
      },
      orderBy: { createdAt: 'desc' },
    });

    if (existing) {
      // Return the existing capability's token — but we can't return the raw
      // token since we only stored the hash. Issue a new one instead.
      // Actually, for simplicity, issue a new capability each time but
      // rate-limit: max 3 active capabilities per onboardingKey per hour.
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
      const recentCount = await db.onboardingUploadCapability.count({
        where: {
          onboardingKey,
          createdAt: { gte: oneHourAgo },
        },
      });
      if (recentCount >= 3) {
        return NextResponse.json(
          { error: 'Too many upload capability requests. Please wait before requesting another.' },
          { status: 429 },
        );
      }
    }

    // Generate the capability token — cryptographically secure
    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

    const expiresAt = new Date(Date.now() + CAPABILITY_EXPIRY_MINUTES * 60 * 1000);

    const ipAddress =
      req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      req.headers.get('x-real-ip') ||
      null;
    const userAgent = req.headers.get('user-agent') || null;

    await db.onboardingUploadCapability.create({
      data: {
        capabilityToken: tokenHash,
        onboardingKey,
        permittedDocTypes: JSON.stringify(ALLOWED_DOC_TYPES),
        maxFiles: MAX_FILES,
        maxFileSizeBytes: MAX_FILE_SIZE,
        expiresAt,
        ipAddress,
        userAgent,
      },
    });

    return NextResponse.json({
      capabilityToken: rawToken, // raw token returned once; only hash stored
      expiresAt: expiresAt.toISOString(),
      permittedDocTypes: ALLOWED_DOC_TYPES,
      maxFiles: MAX_FILES,
      maxFileSizeBytes: MAX_FILE_SIZE,
    });
  } catch (e: any) {
    console.error('Onboarding upload capability error:', e);
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
