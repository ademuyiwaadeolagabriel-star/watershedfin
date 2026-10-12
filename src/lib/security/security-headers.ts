// ============================================================================
// v5 — Central Security Foundation: Security Headers
// ============================================================================
// Production security headers for Next.js. Applied via middleware or
// next.config.ts headers.
// ============================================================================

export const SECURITY_HEADERS: Record<string, string> = {
  // Prevent MIME-type sniffing
  'X-Content-Type-Options': 'nosniff',

  // Prevent clickjacking — no external framing allowed
  'X-Frame-Options': 'DENY',

  // Control referrer information
  'Referrer-Policy': 'strict-origin-when-cross-origin',

  // Restrict browser features
  'Permissions-Policy': 'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()',

  // Force HTTPS — 1 year + preload
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains; preload',

  // Content Security Policy — designed around the actual application
  // Allows: self, inline styles (Next.js requires), Vercel blob, Paystack
  'Content-Security-Policy': [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://js.paystack.co https://checkout.paystack.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "font-src 'self' https://fonts.gstatic.com",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' https://api.paystack.co https://checkout.paystack.com https://*.vercel.app wss:",
    "frame-src 'self' https://checkout.paystack.com",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self' https://checkout.paystack.com",
    "frame-ancestors 'none'",
  ].join('; '),

  // Cross-origin policies
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Resource-Policy': 'same-origin',
};

/**
 * Apply security headers to a NextResponse.
 */
export function applySecurityHeaders(response: Response): Response {
  for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
    response.headers.set(key, value);
  }
  return response;
}
