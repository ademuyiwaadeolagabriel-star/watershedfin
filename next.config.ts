import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  serverExternalPackages: ["jsonwebtoken"],
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
