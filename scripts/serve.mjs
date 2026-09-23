// Tiny static server for the export in out/ — `npm start` after `npm run
// build`, for trying the built app (and its offline behaviour) locally
// without Docker. Mirrors the nginx config in deploy/nginx.conf.
import { createServer } from "node:http";
import { createReadStream, existsSync, statSync } from "node:fs";
import { extname, join, posix, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const out = resolve(dirname(fileURLToPath(import.meta.url)), "../out");
const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

const TYPES = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".webmanifest": "application/manifest+json",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".txt": "text/plain; charset=utf-8",
  ".woff2": "font/woff2",
};

if (!existsSync(out)) {
  console.error("out/ not found — run `npm run build` first");
  process.exit(1);
}

createServer((req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  // URL paths are POSIX; the filesystem path is built from the segments so
  // this behaves the same on Windows and Linux and cannot escape out/.
  let path = posix.normalize(decodeURIComponent(url.pathname));
  if (!path.startsWith("/")) path = "/" + path;
  const segments = path.split("/").filter((seg) => seg && seg !== "..");
  let file = join(out, ...segments);
  if (existsSync(file) && statSync(file).isDirectory()) {
    if (!path.endsWith("/")) {
      res.writeHead(301, { Location: path + "/" + url.search });
      return res.end();
    }
    file = join(file, "index.html");
  }
  if (!existsSync(file)) {
    file = join(out, "404.html");
    res.statusCode = 404;
  }
  const ext = extname(file);
  res.setHeader("Content-Type", TYPES[ext] ?? "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    path === "/sw.js" ? "no-cache" : path.startsWith("/_next/static/") ? "public, max-age=31536000, immutable" : "no-cache",
  );
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(`My Pigs (static export) on http://localhost:${port}`);
});
