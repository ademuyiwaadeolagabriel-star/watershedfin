import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // v50 — strict TypeScript + strict React
  typescript: {
    ignoreBuildErrors: false,
  },
  reactStrictMode: true,
  serverExternalPackages: ["jsonwebtoken"],
  // v5 — Production security headers
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(self), microphone=(self), geolocation=(self), interest-cohort=()' },
          { key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains; preload' },
          {
            key: 'Content-Security-Policy',
            value: [
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
          },
          { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
          { key: 'Cross-Origin-Resource-Policy', value: 'same-origin' },
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

