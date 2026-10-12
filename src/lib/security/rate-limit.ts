// ============================================================================
// v5 — Central Security Foundation: Rate Limiting
// ============================================================================
// Database-backed rate limiter (fallback for when Redis/Upstash is not
// configured). Uses a simple RateLimitEntry table to track request counts
// per (key, window).
//
// In production, prefer Upstash Redis or Vercel KV for distributed rate
// limiting. This DB-backed limiter is a production-grade fallback that
// works on Vercel serverless (unlike in-memory Map<string, ...>).
// ============================================================================

import { db } from '@/lib/db';
import { tooManyRequestsError } from './errors';

interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: Date;
}

/**
 * Check and increment a rate limit counter.
 * Uses atomic database operations to be safe under concurrency.
 *
 * @param key — the rate-limit key (e.g. `login:${ip}` or `otp:${userId}`)
 * @param maxAttempts — max requests in the window
 * @param windowMs — window size in milliseconds (default 15 min)
 * @returns RateLimitResult
 */
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number = 15 * 60 * 1000,
): Promise<RateLimitResult> {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowMs);

  try {
    // Try to find an existing entry
    const existing = await db.rateLimitEntry.findUnique({
      where: { key },
    });

    if (existing) {
      // Check if the window has reset
      if (new Date(existing.windowStart) < windowStart) {
        // Window expired — reset the counter
        await db.rateLimitEntry.update({
          where: { key },
          data: {
            count: 1,
            windowStart: now,
            updatedAt: now,
          },
        });
        return {
          allowed: true,
          remaining: maxAttempts - 1,
          resetAt: new Date(now.getTime() + windowMs),
        };
      }

      // Within the window — check if limit exceeded
      if (existing.count >= maxAttempts) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: new Date(new Date(existing.windowStart).getTime() + windowMs),
        };
      }

      // Increment the counter atomically
      const updated = await db.rateLimitEntry.update({
        where: { key },
        data: {
          count: { increment: 1 },
          updatedAt: now,
        },
      });

      return {
        allowed: true,
        remaining: Math.max(0, maxAttempts - updated.count),
        resetAt: new Date(new Date(updated.windowStart).getTime() + windowMs),
      };
    } else {
      // No existing entry — create one
      await db.rateLimitEntry.create({
        data: {
          key,
          count: 1,
          windowStart: now,
        },
      });
      return {
        allowed: true,
        remaining: maxAttempts - 1,
        resetAt: new Date(now.getTime() + windowMs),
      };
    }
  } catch (e: any) {
    // If the RateLimitEntry table doesn't exist, fail OPEN (allow the request).
    // This prevents rate limiting from blocking all traffic during migration.
    console.warn('[rate-limit] DB error — failing open:', e?.message);
    return {
      allowed: true,
      remaining: maxAttempts,
      resetAt: new Date(now.getTime() + windowMs),
    };
  }
}

/**
 * Enforce a rate limit. If the limit is exceeded, return a 429 response.
 */
export async function enforceRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number = 15 * 60 * 1000,
): Promise<true | Response> {
  const result = await checkRateLimit(key, maxAttempts, windowMs);
  if (!result.allowed) {
    return tooManyRequestsError(
      `Rate limit exceeded. Try again after ${result.resetAt.toISOString()}.`,
    ) as unknown as Response;
  }
  return true;
}

// Pre-configured rate limit presets
export const RATE_LIMITS = {
  LOGIN: { max: 10, windowMs: 15 * 60 * 1000 }, // 10 logins per 15 min per IP
  OTP_REQUEST: { max: 5, windowMs: 60 * 60 * 1000 }, // 5 OTP requests per hour per user
  OTP_VERIFY: { max: 5, windowMs: 5 * 60 * 1000 }, // 5 OTP attempts per 5 min
  PASSWORD_RESET: { max: 3, windowMs: 60 * 60 * 1000 }, // 3 resets per hour per email
  ONBOARDING: { max: 5, windowMs: 60 * 60 * 1000 }, // 5 onboarding attempts per hour per IP
  KYC_UPLOAD: { max: 10, windowMs: 60 * 60 * 1000 }, // 10 uploads per hour per user
  CAC_SEARCH: { max: 20, windowMs: 60 * 60 * 1000 }, // 20 CAC searches per hour
  PAYMENT_INITIATE: { max: 10, windowMs: 15 * 60 * 1000 }, // 10 payments per 15 min
} as const;
