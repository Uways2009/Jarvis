import type { NextConfig } from "next";

/**
 * NEXOVIRA runs behind a proxied preview host during development, so the dev
 * server must accept cross-origin requests for its own internal assets
 * (HMR socket, /_next/* chunks). Production builds are unaffected.
 */
const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.e2b.app",
    "*.arena.ai",
    "localhost",
    "127.0.0.1",
  ],
  // Audio clips are written to disk at runtime; keep the server runtime authoritative.
  reactStrictMode: true,
};

export default nextConfig;
