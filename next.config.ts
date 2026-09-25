import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel's Next.js Runtime manages its own output — standalone is only for
  // self-hosted production servers (sandbox / Docker / Node).
  output: process.env.VERCEL ? undefined : "standalone",
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // PWA asset serving rules (honored by both `next dev` and Vercel):
  // - sw.js must never be cached so updates are picked up immediately.
  // - Service-Worker-Allowed lets /sw.js control the whole origin scope.
  async headers() {
    return [
      {
        source: "/sw.js",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
          { key: "Service-Worker-Allowed", value: "/" },
        ],
      },
      {
        source: "/manifest.webmanifest",
        headers: [
          { key: "Cache-Control", value: "public, max-age=0, must-revalidate" },
        ],
      },
    ];
  },
};

export default nextConfig;
