import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // v50 — Issue #32: We are now strict on TypeScript errors. The build will
  // fail if there are any type errors. This is the correct posture for a
  // financial application: errors that previously were silently swallowed
  // (and could mask real bugs in money calculations, IDOR fixes, etc.) now
  // block the build. The previous `ignoreBuildErrors: true` was a
  // development-time shortcut that should never have shipped.
  typescript: {
    ignoreBuildErrors: false,
  },
  // v50 — Issue #33: reactStrictMode back on. This catches side-effect
  // double-invocations and lifecycle issues at dev time, which is
  // especially important for the payment / KYC mutation flows we just
  // hardened. Strict mode is a no-op in production.
  reactStrictMode: true,
  serverExternalPackages: ["jsonwebtoken"],
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' },
        ],
      },
    ];
  },
  // v43: Rewrite /uploads/kyc/* to serve from /tmp in local dev
  // (Vercel Blob handles this in production — no rewrite needed)
  async rewrites() {
    if (process.env.NODE_ENV === 'development') {
      return [
        {
          source: '/uploads/kyc/:path*',
          destination: '/api/dev-serve-upload?path=:path*',
        },
      ];
    }
    return [];
  },
};

export default nextConfig;

