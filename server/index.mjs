// The My Pigs server: hands out the static export in out/ and guards it.
//
// The farm's records ship inside the app's JavaScript, so the files
// themselves are what needs protecting. Only the sign-in screens and what
// they load are public; every other file needs a session (see auth.mjs).
//
//   pnpm start            serves out/ and the auth API on PORT (default 3000)
//   API_ONLY=1 …          just the auth API, for `pnpm dev` (next dev proxies to it)
import { createServer } from "node:http";
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { extname, join, posix, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { createAuth } from "./auth.mjs";
import { createMailer } from "./mail.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");
const env = process.env;
const apiOnly = env.API_ONLY === "1";
const port = Number(env.PORT ?? 3000);
const host = env.HOST ?? "0.0.0.0";

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

if (!apiOnly && !existsSync(out)) {
  console.error("out/ not found — run `pnpm build` first");
  process.exit(1);
}

const auth = createAuth({
  dataFile: resolve(root, env.AUTH_DATA_FILE ?? "data/auth.json"),
  signupCode: env.SIGNUP_CODE ?? "",
  appUrl: env.APP_URL ?? "",
  trustProxy: env.TRUST_PROXY === "1",
  sendMail: createMailer({ smtpUrl: env.SMTP_URL ?? "", from: env.MAIL_FROM ?? "" }),
});

// ── What a signed-out visitor may load ──────────────────────────────────────
const AUTH_PAGES = ["signin", "signup", "forgot-password", "reset-password"];
const PUBLIC_FILES = new Set(["/manifest.webmanifest", "/offline.html", "/favicon.ico"]);
const publicAssets = new Set();
if (!apiOnly) {
  // The build assets the sign-in screens reference, and nothing else under /_next/.
  for (const page of AUTH_PAGES) {
    const file = join(out, page, "index.html");
    if (!existsSync(file)) continue;
    for (const m of readFileSync(file, "utf8").matchAll(/\/_next\/static\/[^"'\\\s<>)]+/g)) publicAssets.add(m[0].split("?")[0]);
  }
}

function isPublic(path) {
  if (PUBLIC_FILES.has(path) || path.startsWith("/icons/")) return true;
  if (AUTH_PAGES.some((p) => path === `/${p}` || path.startsWith(`/${p}/`))) return true;
  return publicAssets.has(path);
}

const SECURITY = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "same-origin",
  "X-Frame-Options": "DENY",
};

createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", "http://x");
  for (const [k, v] of Object.entries(SECURITY)) res.setHeader(k, v);

  if (url.pathname.startsWith("/api/")) {
    if (await auth.handle(req, res, url.pathname)) return;
    res.writeHead(404, { "Content-Type": "application/json; charset=utf-8" });
    return res.end('{"error":"Not found."}');
  }
  if (apiOnly || (req.method !== "GET" && req.method !== "HEAD")) {
    res.writeHead(apiOnly ? 404 : 405);
    return res.end();
  }

  // URL paths are POSIX; the filesystem path is built from the segments so
  // this behaves the same on Windows and Linux and cannot escape out/.
  let path;
  try {
    path = posix.normalize(decodeURIComponent(url.pathname));
  } catch {
    res.writeHead(400);
    return res.end();
  }
  if (!path.startsWith("/")) path = "/" + path;
  const segments = path.split("/").filter((seg) => seg && seg !== "..");

  const gated = !isPublic(path);
  if (gated && !auth.sessionUser(req)) {
    // A person opening a screen is sent to sign in; a script, stylesheet or
    // service-worker precache request just gets told no (a redirect there
    // would cache the sign-in page under the wrong name).
    const navigating = req.headers["sec-fetch-mode"] ? req.headers["sec-fetch-mode"] === "navigate" : String(req.headers.accept ?? "").includes("text/html");
    if (navigating) {
      const next = path === "/" ? "" : `?next=${encodeURIComponent(path + url.search)}`;
      res.writeHead(302, { Location: `/signin/${next}`, "Cache-Control": "no-store" });
    } else {
      res.writeHead(401, { "Cache-Control": "no-store" });
    }
    return res.end();
  }

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
  res.setHeader("Content-Type", TYPES[extname(file)] ?? "application/octet-stream");
  res.setHeader(
    "Cache-Control",
    path.startsWith("/_next/static/") ? `${gated ? "private" : "public"}, max-age=31536000, immutable` : "no-cache",
  );
  if (path === "/sw.js") res.setHeader("Service-Worker-Allowed", "/");
  if (req.method === "HEAD") return res.end();
  createReadStream(file).pipe(res);
}).listen(port, host, () => {
  console.log(apiOnly ? `My Pigs auth API on http://localhost:${port}` : `My Pigs on http://localhost:${port}`);
});
