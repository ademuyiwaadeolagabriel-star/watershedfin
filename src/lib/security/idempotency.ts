// ============================================================================
// v5 — Central Security Foundation: Idempotency
// ============================================================================
// Generic idempotency-key pattern for financial mutations.
// ============================================================================

import { db } from '@/lib/db';
import { conflictError } from './errors';

/**
 * Process a request with idempotency. If the same Idempotency-Key is
 * seen twice, the original response is returned.
 *
 * @param key — the Idempotency-Key from the request header
 * @param operation — the operation type (e.g. 'payment', 'disbursement')
 * @param execute — the function to execute if this is a new request
 * @returns the result of the first execution, or a conflict error
 */
export async function withIdempotency<T>(
  key: string | null,
  operation: string,
  execute: () => Promise<T>,
): Promise<T | Response> {
  if (!key) {
    // No idempotency key — just execute normally
    return execute();
  }

  try {
    // Check if this key has been seen before
    const existing = await db.idempotencyRecord.findUnique({
      where: { key },
    });

    if (existing) {
      // Return the cached response
      if (existing.responseBody) {
        const body = JSON.parse(existing.responseBody);
        return new Response(JSON.stringify(body), {
          status: existing.responseStatus || 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return conflictError('Duplicate idempotency key — operation already processed.') as unknown as Response;
    }

    // Create the idempotency record (claim the key)
    await db.idempotencyRecord.create({
      data: {
        key,
        operation,
        status: 'PROCESSING',
      },
    });
  } catch (e: any) {
    // If P2002 (unique constraint violation), another request is processing
    // or has already processed this key — return conflict
    if (e?.code === 'P2002') {
      return conflictError('Duplicate idempotency key — operation already processed or in progress.') as unknown as Response;
    }
    // Other errors — fail open (just execute without idempotency)
    console.warn('[idempotency] DB error — proceeding without idempotency:', e?.message);
  }

  // Execute the operation
  const result = await execute();

  // Store the response (if it's a Response object)
  if (result instanceof Response) {
    try {
      const body = await result.clone().text();
      await db.idempotencyRecord.update({
        where: { key },
        data: {
          status: 'COMPLETED',
          responseBody: body,
          responseStatus: result.status,
          completedAt: new Date(),
        },
      });
    } catch {
      // Non-blocking
    }
  }

  return result;
}

/**
 * Extract the Idempotency-Key from a request header.
 */
export function getIdempotencyKey(req: Request): string | null {
  return req.headers.get('x-idempotency-key') || req.headers.get('idempotency-key');
}
