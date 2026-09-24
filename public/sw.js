const SW_VERSION = "dev-local";
const CACHE_NAME = `modeltide-${SW_VERSION}`;

const API_PREFIX = "/api";

const OTHER_CACHE_MAX = 100;

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

async function handleNavigation(event) {
  try {
    return await fetch(event.request);
  } catch {
    const shell = await caches.match("/", { ignoreSearch: true });
    if (shell) return shell;
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

async function handleAsset(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  try {
    const res = await fetch(request);
    if (res && res.ok) event.waitUntil(cache.put(request, res.clone()).catch(() => {}));
    return res;
  } catch {
    return new Response("Offline", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

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

async function writeAndTrim(cache, request, response) {
  await cache.put(request, response).catch(() => {});
  await trimOtherCache(cache).catch(() => {});
}

async function handleOther(event) {
  const { request } = event;
  const cache = await caches.open(CACHE_NAME);
  try {
    const res = await fetch(request);
    if (res && res.ok) event.waitUntil(writeAndTrim(cache, request, res.clone()));
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
    event.respondWith(handleNavigation(event));
  } else if (isImmutableAsset(url.pathname)) {
    event.respondWith(handleAsset(event));
  } else {
    event.respondWith(handleOther(event));
  }
});
