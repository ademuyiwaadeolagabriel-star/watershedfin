import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/lib/db';
import { requireRole } from '@/lib/auth';

const STAFF_ROLES = [
  'super',
  'md',
  'hoc',
  'cro',
  'credit',
  'loan',
  'bm',
  'lo',
  'frontdesk',
];

const CHANNELS = [
  'self_onboard',
  'desk_onboard',
  'bm_onboard',
  'field_onboard',
];

function hashToken(token: string) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const channel = String(body?.channel || '').trim();

    if (!CHANNELS.includes(channel)) {
      return NextResponse.json(
        { error: 'Invalid onboarding channel.' },
        { status: 400 }
      );
    }

    let actorUserId: string | undefined;

    if (channel !== 'self_onboard') {
      const authResult = await requireRole(req, STAFF_ROLES);

      if (authResult instanceof NextResponse) {
        return authResult;
      }

      actorUserId = (authResult as { id: string }).id;
    }

    const token = crypto.randomBytes(32).toString('hex');
    const sessionTokenHash = hashToken(token);

    // Upload sessions are intentionally short-lived.
    const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

    const session = await db.onboardingUploadSession.create({
      data: {
        sessionTokenHash,
        channel,
        actorUserId: actorUserId || null,
        expiresAt,
      },
      select: {
        id: true,
        expiresAt: true,
      },
    });

    return NextResponse.json({
      success: true,
      sessionId: session.id,
      sessionToken: token,
      expiresAt: session.expiresAt.toISOString(),
    });
  } catch (error) {
    console.error('[onboard/upload-session] error', error);

    return NextResponse.json(
      { error: 'Unable to create onboarding upload session.' },
      { status: 500 }
    );
  }
}
