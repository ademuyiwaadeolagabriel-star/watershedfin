import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

// ============================================================================
// v50 — Centralized cron authentication helper
// ============================================================================
// Issue: cron routes previously used a hard-coded fallback secret:
//
//   process.env.CRON_SECRET || 'watershed-cron-secret'
//
// That means in production, if the operator forgot to set CRON_SECRET,
// the cron endpoints would silently accept the publicly-known hard-coded
// string 'watershed-cron-secret' — letting anyone on the internet trigger
// daily NPL reclassifications, drip-campaign broadcasts, payment
// reminders, or audit cleanup.
//
// v50 fix: fail CLOSED. If CRON_SECRET is unset:
//   - In production → reject with 500 (server misconfigured)
//   - In dev        → accept (for local testing) but log loudly
//
// Usage:
//   const auth = requireCronAuth(req);
//   if (auth instanceof NextResponse) return auth;
// ============================================================================

export function requireCronAuth(req: NextRequest): NextResponse | true {
  const secret = process.env.CRON_SECRET;
  const isProd = process.env.NODE_ENV === 'production';

  if (!secret) {
    if (isProd) {
      console.error('[CRON] FATAL: CRON_SECRET not set in production. Rejecting request.');
      return NextResponse.json(
        { error: 'Server misconfigured: cron secret not set.' },
        { status: 500 },
      );
    }
    // Dev: log loudly but accept so local cron-style curls still work.
    console.warn('[CRON] CRON_SECRET not set in dev — auth bypassed. NEVER deploy without CRON_SECRET.');
    return true;
  }

  const authHeader = req.headers.get('authorization');
  const expected = `Bearer ${secret}`;

  // Use timing-safe comparison to prevent timing attacks against the secret.
  if (!authHeader) {
    return NextResponse.json({ error: 'Unauthorized: missing Authorization header.' }, { status: 401 });
  }
  if (authHeader.length !== expected.length) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }
  // Safe only after length check.
  const a = Buffer.from(authHeader);
  const b = Buffer.from(expected);
  if (!crypto.timingSafeEqual(a, b)) {
    return NextResponse.json({ error: 'Unauthorized.' }, { status: 401 });
  }

  return true;
}
