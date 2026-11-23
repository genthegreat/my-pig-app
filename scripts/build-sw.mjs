// Post-build: walk out/, list every file as a URL, and write out/sw.js with
// that list and a version derived from the files' contents. Runs after
// `next build` (see package.json "postbuild").
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { join, relative, resolve, dirname, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = resolve(root, "out");
const template = readFileSync(resolve(root, "scripts/sw-template.js"), "utf8");

// Next 16 on Windows writes segment-cache payloads as nested directories
// (`__next.animals/detail/__PAGE__.txt`) where the router requests a flat
// dotted name (`__next.animals.detail.__PAGE__.txt`) — its export only
// replaces forward slashes. Linux builds are already flat; this makes a
// Windows build identical.
function flattenSegmentDirs(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (!statSync(p).isDirectory()) continue;
    if (name.startsWith("__next.")) {
      for (const f of walk(p)) {
        const rel = relative(p, f).split(sep).join(".");
        renameSync(f, join(dir, `${name}.${rel}`));
      }
      rmSync(p, { recursive: true, force: true });
    } else {
      flattenSegmentDirs(p);
    }
  }
}

function walk(dir, acc = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, acc);
    else acc.push(p);
  }
  return acc;
}

flattenSegmentDirs(out);
mkdirSync(out, { recursive: true });

const SKIP = new Set(["sw.js", "robots.txt", "sitemap.xml"]);
const files = walk(out)
  .map((p) => relative(out, p).split(sep).join("/"))
  .filter((p) => !SKIP.has(p) && !p.endsWith(".map") && !p.startsWith(".") && !p.endsWith(".nft.json"));

const urls = files.map((p) => {
  if (p === "index.html") return "/";
  if (p.endsWith("/index.html")) return "/" + p.slice(0, -"index.html".length);
  return "/" + p;
});

const hash = createHash("sha256");
hash.update(template); // a changed worker is a new version even if the pages are not
for (const p of files.sort()) {
  hash.update(p);
  hash.update(readFileSync(join(out, p)));
}
const version = hash.digest("hex").slice(0, 12);

const sw = template.replace("__VERSION__", version).replace("/* __PRECACHE__ */ []", JSON.stringify(urls.sort(), null, 1));
writeFileSync(resolve(out, "sw.js"), sw);

// The sign-in screens are served to anyone, so nothing they load may carry
// the farm. Everything that touches the records goes through the Dexie
// store, whose table names give it away.
const publicAssets = new Set();
for (const page of ["signin", "signup", "forgot-password", "reset-password"]) {
  for (const m of readFileSync(join(out, page, "index.html"), "utf8").matchAll(/\/_next\/static\/[^"'\\\s<>)]+/g)) publicAssets.add(m[0].split("?")[0]);
}
for (const asset of publicAssets) {
  if (!asset.endsWith(".js")) continue;
  if (/sync_queue|weigh_event/.test(readFileSync(join(out, asset), "utf8"))) {
    console.error(`build-sw: ${asset} is loaded by a sign-in screen but contains the farm store.\nSomething under src/app/(auth) or src/auth imports from @/db or @/seed — it must not.`);
    process.exit(1);
  }
}

const totalKb = Math.round(files.reduce((s, p) => s + statSync(join(out, p)).size, 0) / 1024);
console.log(`sw.js: version ${version}, ${urls.length} files precached (${totalKb} kB)`);
