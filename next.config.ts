import type { NextConfig } from "next";

// Static export: every route becomes a plain HTML file, which the service worker
// precaches. That is what makes "every screen works with no connection" a
// property of the build rather than a hope. There is no server at runtime —
// the local store is the source of truth, exactly as the spec requires.
//
// The one thing that does need a server is signing in (server/). Under
// `next dev` there is no export, and /api is passed through to that server,
// which `pnpm dev` starts alongside on AUTH_PORT.
const dev = process.env.NODE_ENV === "development";
const nextConfig: NextConfig = {
  ...(dev
    ? {
        skipTrailingSlashRedirect: true,
        rewrites: async () => [
          { source: "/api/:path*", destination: `http://127.0.0.1:${process.env.AUTH_PORT ?? 3001}/api/:path*` },
        ],
      }
    : { output: "export" as const }),
  trailingSlash: true,
  reactStrictMode: true,
  images: { unoptimized: true },
};

export default nextConfig;
