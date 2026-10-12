// ============================================================================
// v5 — Central Security Foundation: Error Handling
// ============================================================================
// Production-safe error responses. Never expose internal details.
// ============================================================================

import { NextResponse } from 'next/server';
import { randomUUID } from 'crypto';

export function safeError(message: string = 'An unexpected error occurred.', status: number = 500) {
  const correlationId = randomUUID().slice(0, 8);
  return NextResponse.json(
    {
      error: message,
      correlationId,
    },
    { status },
  );
}

export function unauthorizedError(message: string = 'Authentication required.') {
  return NextResponse.json({ error: message }, { status: 401 });
}

export function forbiddenError(message: string = 'Access denied.') {
  return NextResponse.json({ error: message }, { status: 403 });
}

export function badRequestError(message: string) {
  return NextResponse.json({ error: message }, { status: 400 });
}

export function notFoundError(message: string = 'Resource not found.') {
  return NextResponse.json({ error: message }, { status: 404 });
}

export function conflictError(message: string) {
  return NextResponse.json({ error: message }, { status: 409 });
}

export function tooManyRequestsError(message: string = 'Too many requests. Please try again later.') {
  return NextResponse.json({ error: message }, { status: 429 });
}

/**
 * Wrap an async route handler with production-safe error handling.
 * Catches all exceptions, logs the full error server-side, and returns
 * a sanitized error response to the client.
 */
export function withErrorHandler<T extends (...args: any[]) => Promise<any>>(
  handler: T,
): T {
  return (async (...args: any[]) => {
    try {
      return await handler(...args);
    } catch (e: any) {
      const correlationId = randomUUID().slice(0, 8);
      console.error(`[error-handler] correlationId=${correlationId}`, e?.message, e?.stack);
      return NextResponse.json(
        {
          error: 'An unexpected error occurred.',
          correlationId,
        },
        { status: 500 },
      );
    }
  }) as T;
}
