// Rewritten to the built client bundle hash by the vite plugin (vite.config.ts); dev serves this literal.
const SW_VERSION = "dev-local";
const CACHE_NAME = `modeltide-${SW_VERSION}`;

// Must match the shared API_PREFIX (src/shared/config/paths.ts); this file cannot import it.
const API_PREFIX = "/api";

const OTHER_CACHE_MAX = 100;

// Build rewrites this from the emitted index.html (vite.config.ts) and leaves it empty in dev;
// lazy chunks stay out because install is all-or-nothing.
const PRECACHE_SHELL = [];

const PRECACHE_URLS = [
  "/",
  "/manifest.webmanifest",
  "/icons/app-icon.svg",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
  ...PRECACHE_SHELL,
];

self.addEventListener("install", (event) => {
  // A failed precache must reject installation: catching it would let a partial cache activate.
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(PRECACHE_URLS)));
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

function isCacheable(request) {
  if (request.method !== "GET") return false;
  let url;
  try {
    url = new URL(request.url);
  } catch {
    return false;
  }
  if (url.origin !== self.location.origin) return false;
  if (url.pathname === API_PREFIX || url.pathname.startsWith(`${API_PREFIX}/`)) return false;
  if (url.pathname === "/sw.js") return false;
  return true;
}

function isImmutableAsset(pathname) {
  return pathname.startsWith("/assets/");
}

function navigationCacheKey(url) {
  const pathname = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") || "/" : url.pathname;
  return `${url.origin}${pathname}`;
}

async function handleNavigation(request) {
  const url = new URL(request.url);
  const key = navigationCacheKey(url);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(key, res.clone()).catch(() => {});
      // One entry per visited route, all sharing the shell HTML: without a trim here they accumulate forever.
      await trimOtherCache(cache).catch(() => {});
    }
    return res;
  } catch {
    const cached = await caches.match(key);
    if (cached) return cached;
    // Every pathname answers with the same shell, so the precached "/" serves a navigation with no
    // exact entry yet; without it the offline user gets a bare 503 and no app.
    const shell = await caches.match("/", { ignoreSearch: true });
    if (shell) return shell;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function handleAsset(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) await cache.put(request, res.clone()).catch(() => {});
    return res;
  } catch {
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

// The precache and the hashed bundle are the offline floor, so only the rest of the bucket is trimmable.
const PROTECTED_PATHS = new Set(PRECACHE_URLS);

function isTrimmable(request) {
  try {
    const { pathname } = new URL(request.url);
    return !PROTECTED_PATHS.has(pathname) && !isImmutableAsset(pathname);
  } catch {
    return false;
  }
}

async function trimOtherCache(cache) {
  try {
    const keys = (await cache.keys()).filter(isTrimmable);
    if (keys.length <= OTHER_CACHE_MAX) return;
    await Promise.all(keys.slice(0, keys.length - OTHER_CACHE_MAX).map((k) => cache.delete(k)));
  } catch {}
}

async function handleOther(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok) {
      await cache.put(request, res.clone()).catch(() => {});
      await trimOtherCache(cache).catch(() => {});
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
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(request));
  } else if (isImmutableAsset(url.pathname)) {
    event.respondWith(handleAsset(request));
  } else {
    event.respondWith(handleOther(request));
  }
});
