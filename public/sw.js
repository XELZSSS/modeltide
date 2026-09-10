/* ModelTide service worker (no build step, served as /sw.js).
 *
 * Strategy:
 * - Precache the app shell + icons on install.
 * - Navigations: network-first, fall back to cached "/" (app shell) offline.
 * - Hashed build output (/assets/*) + fonts/icons: cache-first with
 *   background revalidation (filenames are content-hashed, so stale risk is nil).
 * - /api/*: never cached, always network (server + React Query own the policy).
 *   Offline reads are served from the React Query cache, not the SW — do NOT
 *   add stale-while-revalidate here or prices/rankings will go stale silently.
 * - SKIP_WAITING message from the client activates updates on demand.
 */

// Bump to force a fresh cache set on breaking changes. NOTE: this file has
// no build step — bump manually on shell-breaking releases, and keep
// PRECACHE_URLS in sync with public/manifest.webmanifest icons.
const SW_VERSION = "modeltide-v2";
const CACHE_NAME = `modeltide-${SW_VERSION}`;

// Bound the generic same-origin cache: navigations/assets are managed
// separately, everything else is best-effort LRU.
const OTHER_CACHE_MAX = 100;

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/app-icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE_NAME)
      .then((cache) => cache.addAll(PRECACHE_URLS))
      // A single missing icon must not brick activation.
      .catch((err) => console.warn("[sw] precache failed:", err)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const keys = await caches.keys();
      await Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)));
      await self.clients.claim();
    })(),
  );
});

self.addEventListener("message", (event) => {
  if (event.data && event.data.type === "SKIP_WAITING") void self.skipWaiting();
});

/** Same-origin GET only; API + dev HMR traffic bypasses the worker. */
function isCacheable(request) {
  if (request.method !== "GET") return false;
  // Malformed request URLs would throw and kill the fetch handler: fall
  // through to "not cacheable" instead.
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === "/api" || url.pathname.startsWith("/api/")) return false;
  if (url.pathname === "/sw.js") return false;
  return true;
}

function isImmutableAsset(pathname) {
  return pathname.startsWith("/assets/") || pathname.startsWith("/fonts/") || pathname.startsWith("/icons/");
}

/** Navigation: try network, fall back to the cached app shell.
 *  Only healthy responses refresh the shell cache: a transient 5xx/404 must
 *  not poison the offline fallback (stale-if-error, matching the CDN header). */
async function handleNavigation(request) {
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put("/", res.clone()).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match("/", { ignoreSearch: true });
    if (cached) return cached;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

/** Immutable assets: pure cache-first (filenames are content-hashed). */
async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function trimOtherCache(cache) {
  try {
    const keys = await cache.keys();
    if (keys.length <= OTHER_CACHE_MAX) return;
    await Promise.all(keys.slice(0, keys.length - OTHER_CACHE_MAX).map((k) => cache.delete(k)));
  } catch {}
}

/** Everything else same-origin: network-first with bounded cache fallback. */
async function handleOther(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      cache.put(request, res.clone()).catch(() => {});
      trimOtherCache(cache).catch(() => {});
    }
    return res;
  } catch {
    const cached = await cache.match(request);
    if (cached) return cached;
    throw new Error("offline");
  }
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (!isCacheable(request)) return;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return; // Uncacheable malformed URL: let the browser handle the fetch.
  }
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  } else if (isImmutableAsset(url.pathname)) {
    event.respondWith(handleAsset(request));
  } else {
    event.respondWith(handleOther(request));
  }
});
