import { NextResponse } from 'next/server';

// ============================================================================
// GET /api/health
// v5 Phase 6 — Production health check endpoint.
//
// Returns a safe liveness/readiness response WITHOUT exposing:
//   - database credentials
//   - environment variables
//   - stack traces
//   - internal infrastructure secrets
//   - connection strings
//
// The response is intentionally minimal — just indicates whether the
// application process is alive and can respond to HTTP requests.
// ============================================================================

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'watershed-capital',
    version: '5.0.0',
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, max-age=0',
    },
  });
}
