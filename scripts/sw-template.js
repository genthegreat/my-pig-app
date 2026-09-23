/* My Pigs service worker.
 *
 * The app is a static export: every screen is a file in the precache list
 * below, injected at build time by scripts/build-sw.mjs. Precached files are
 * served cache-first, so the app opens and navigates with no signal at all.
 * Anything else goes network-first with a cache fallback.
 */
/* global self, caches, fetch, Response */

const VERSION = "__VERSION__";
const PRECACHE = /* __PRECACHE__ */ [];
const CACHE = `my-pigs-${VERSION}`;
const OFFLINE_URL = "/offline.html";

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      // Add in small batches so one slow file does not stall the rest.
      const batch = 20;
      for (let i = 0; i < PRECACHE.length; i += batch) {
        await cache.addAll(PRECACHE.slice(i, i + batch));
      }
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k.startsWith("my-pigs-") && k !== CACHE).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});

function normalise(url) {
  // Cache keys never carry a query string; Next's router adds ?_rsc=… to
  // payload fetches and the app adds ?id=… to screens.
  const u = new URL(url);
  u.search = "";
  u.hash = "";
  return u;
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Next's prefetcher probes each link with a HEAD before fetching its
  // payload. Answer from the precache so prefetching works offline too.
  if (request.method === "HEAD") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        const hit = await cache.match(normalise(request.url).href, { ignoreMethod: true });
        if (hit) return new Response(null, { status: 200, headers: hit.headers });
        try {
          return await fetch(request);
        } catch {
          return new Response(null, { status: 503 });
        }
      })(),
    );
    return;
  }
  if (request.method !== "GET") return;

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const clean = normalise(request.url);

      // 1. Precached? Serve it.
      const hit = (await cache.match(clean.href)) || (request.mode === "navigate" ? await cache.match(clean.pathname.endsWith("/") ? clean.href : clean.href + "/") : undefined);
      if (hit) return hit;

      // 2. Otherwise the network, remembering the answer for next time.
      try {
        const res = await fetch(request);
        if (res.ok && (url.pathname.startsWith("/_next/") || request.mode === "navigate")) {
          cache.put(clean.href, res.clone());
        }
        return res;
      } catch {
        // 3. Offline and not cached: a screen gets the offline page, an
        //    RSC payload gets an empty response so the router falls back to
        //    a full navigation (which the precache does serve).
        if (request.mode === "navigate") {
          return (await cache.match(OFFLINE_URL)) || new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
        }
        return new Response("", { status: 503 });
      }
    })(),
  );
});
