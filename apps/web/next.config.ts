import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  async rewrites() {
    return [
      { source: "/api/:path*", destination: "http://localhost:4000/api/:path*" },
      { source: "/media/:path*", destination: "http://localhost:4000/media/:path*" },
    ];
  },
};

export default nextConfig;
