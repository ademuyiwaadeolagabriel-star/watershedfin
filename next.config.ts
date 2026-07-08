import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // Fix: jsonwebtoken is a Node.js-only module — exclude from client bundle
  // In Next.js 16, this moved from experimental.serverComponentsExternalPackages to serverExternalPackages
  serverExternalPackages: ["jsonwebtoken"],
};

export default nextConfig;
