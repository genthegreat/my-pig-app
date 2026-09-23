import type { NextConfig } from "next";

// Static export: every route becomes a plain HTML file, which the service worker
// precaches. That is what makes "every screen works with no connection" a
// property of the build rather than a hope. There is no server at runtime —
// the local store is the source of truth, exactly as the spec requires.
const nextConfig: NextConfig = {
  output: "export",
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
