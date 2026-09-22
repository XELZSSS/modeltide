/* ModelTide service worker (no build step, served as /sw.js). */

const SW_VERSION = "modeltide-v5";
const CACHE_NAME = `modeltide-${SW_VERSION}`;

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

function isCacheable(request) {
  if (request.method !== "GET") return false;
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
  return pathname.startsWith("/assets/");
}

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
