import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

/**
 * Notification preferences per user, stored as a JSON string on
 * `User.notificationPreferences`. Shape (default when not set):
 *
 * {
 *   loan:     { email: true, sms: true,  push: true  },
 *   payment:  { email: true, sms: true,  push: true  },
 *   kyc:      { email: true, sms: false, push: true  },
 *   marketing:{ email: true, sms: false, push: false },
 *   ticket:   { email: true, sms: false, push: true  },
 *   system:   { email: true, sms: false, push: true  }
 * }
 */

export const DEFAULT_PREFERENCES = {
  loan: { email: true, sms: true, push: true },
  payment: { email: true, sms: true, push: true },
  kyc: { email: true, sms: false, push: true },
  marketing: { email: true, sms: false, push: false },
  ticket: { email: true, sms: false, push: true },
  system: { email: true, sms: false, push: true },
} as const;

export type NotificationPreferences = typeof DEFAULT_PREFERENCES;

function parsePreferences(raw: string | null | undefined): NotificationPreferences {
  if (!raw) return { ...DEFAULT_PREFERENCES } as NotificationPreferences;
  try {
    const parsed = JSON.parse(raw);
    // Merge with defaults so newly-added categories always have sensible values
    return {
      ...DEFAULT_PREFERENCES,
      ...parsed,
      loan: { ...DEFAULT_PREFERENCES.loan, ...(parsed.loan || {}) },
      payment: { ...DEFAULT_PREFERENCES.payment, ...(parsed.payment || {}) },
      kyc: { ...DEFAULT_PREFERENCES.kyc, ...(parsed.kyc || {}) },
      marketing: { ...DEFAULT_PREFERENCES.marketing, ...(parsed.marketing || {}) },
      ticket: { ...DEFAULT_PREFERENCES.ticket, ...(parsed.ticket || {}) },
      system: { ...DEFAULT_PREFERENCES.system, ...(parsed.system || {}) },
    } as NotificationPreferences;
  } catch {
    return { ...DEFAULT_PREFERENCES } as NotificationPreferences;
  }
}

/**
 * GET /api/customer/notification-preferences?userId=
 */
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get('userId');
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    return NextResponse.json({
      preferences: parsePreferences(user.notificationPreferences),
    });
  } catch (e: any) {
    console.error('[notification-preferences] GET error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

/**
 * PUT /api/customer/notification-preferences
 * Body: { userId, preferences: NotificationPreferences }
 */
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json();
    const { userId, preferences } = body as {
      userId: string;
      preferences: Partial<NotificationPreferences>;
    };

    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 });
    if (!preferences || typeof preferences !== 'object') {
      return NextResponse.json({ error: 'preferences object required' }, { status: 400 });
    }

    const user = await db.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const current = parsePreferences(user.notificationPreferences);
    const merged: NotificationPreferences = {
      loan: { ...current.loan, ...(preferences.loan || {}) },
      payment: { ...current.payment, ...(preferences.payment || {}) },
      kyc: { ...current.kyc, ...(preferences.kyc || {}) },
      marketing: { ...current.marketing, ...(preferences.marketing || {}) },
      ticket: { ...current.ticket, ...(preferences.ticket || {}) },
      system: { ...current.system, ...(preferences.system || {}) },
    } as NotificationPreferences;

    await db.user.update({
      where: { id: userId },
      data: { notificationPreferences: JSON.stringify(merged) },
    });

    return NextResponse.json({ success: true, preferences: merged });
  } catch (e: any) {
    console.error('[notification-preferences] PUT error:', e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
