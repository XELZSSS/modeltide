import fs from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://example.test";
const SW_PATH = fileURLToPath(new URL("../public/sw.js", import.meta.url));
const SW_SOURCE = fs.readFileSync(SW_PATH, "utf8");

// public/sw.js is a classic script: evaluate it as a function body with an epilogue returning its declarations.
const EPILOGUE = "\nreturn { CACHE_NAME, isCacheable, isImmutableAsset, handleNavigation };\n";

interface SwRequest {
  url: string;
  method: string;
  mode?: string;
}

interface SwApi {
  CACHE_NAME: string;
  isCacheable: (request: SwRequest) => boolean;
  isImmutableAsset: (pathname: string) => boolean;
  handleNavigation: (request: SwRequest) => Promise<Response>;
}

type Handler = (event: { data?: unknown }) => void;

function request(path: string, over: Partial<SwRequest> = {}): SwRequest {
  return { url: `${ORIGIN}${path}`, method: "GET", ...over };
}

function loadServiceWorker(source = SW_SOURCE) {
  const handlers = new Map<string, Handler>();
  const put = vi.fn(async (_key: string, _response: Response) => {});
  const skipWaiting = vi.fn(async () => {});
  const cache = {
    put,
    match: vi.fn(async (_key: string) => undefined),
    keys: vi.fn(async () => [] as string[]),
  };
  const self = {
    location: { origin: ORIGIN },
    clients: { claim: vi.fn(async () => {}) },
    skipWaiting,
    addEventListener: (type: string, handler: Handler) => handlers.set(type, handler),
  };
  const caches = {
    open: vi.fn(async (_name: string) => cache),
    match: vi.fn(async (_key: string) => undefined),
    keys: vi.fn(async () => [] as string[]),
    delete: vi.fn(async (_name: string) => true),
  };
  const evaluate = new Function("self", "caches", "fetch", `${source}${EPILOGUE}`) as (
    self: unknown,
    caches: unknown,
    fetch: unknown,
  ) => SwApi;
  const api = evaluate(
    self,
    caches,
    vi.fn(async () => new Response("shell", { status: 200 })),
  );
  return { ...api, handlers, put, skipWaiting };
}

describe("isCacheable", () => {
  it("rejects the API prefix and everything under it", () => {
    const sw = loadServiceWorker();
    expect(sw.isCacheable(request("/api"))).toBe(false);
    expect(sw.isCacheable(request("/api/news"))).toBe(false);
    expect(sw.isCacheable(request("/apiary"))).toBe(true);
  });

  it("rejects the service worker itself, cross-origin URLs and non-GET requests", () => {
    const sw = loadServiceWorker();
    expect(sw.isCacheable(request("/sw.js"))).toBe(false);
    expect(sw.isCacheable({ url: "https://cdn.example.test/models", method: "GET" })).toBe(false);
    expect(sw.isCacheable(request("/models", { method: "POST" }))).toBe(false);
    expect(sw.isCacheable(request("/models"))).toBe(true);
  });
});

describe("isImmutableAsset", () => {
  it("matches immutable build assets and nothing else", () => {
    const sw = loadServiceWorker();
    expect(sw.isImmutableAsset("/assets/index-CQkEccLA.js")).toBe(true);
    expect(sw.isImmutableAsset("/assets")).toBe(false);
    expect(sw.isImmutableAsset("/icons/icon-192.png")).toBe(false);
    expect(sw.isImmutableAsset("/models")).toBe(false);
  });
});

describe("SW_VERSION", () => {
  it("derives CACHE_NAME from the declaration the build rewrites", () => {
    expect(SW_SOURCE).toMatch(/const SW_VERSION = "[^"]*";/);
    expect(loadServiceWorker().CACHE_NAME).toBe("modeltide-dev-local");
    const rebuilt = SW_SOURCE.replace('const SW_VERSION = "dev-local";', 'const SW_VERSION = "sha-9f8e7d6c5b4a";');
    expect(loadServiceWorker(rebuilt).CACHE_NAME).toBe("modeltide-sha-9f8e7d6c5b4a");
  });
});

describe("message", () => {
  it("activates a waiting worker on SKIP_WAITING", () => {
    const sw = loadServiceWorker();
    const onMessage = sw.handlers.get("message");
    onMessage?.({ data: { type: "OTHER" } });
    expect(sw.skipWaiting).not.toHaveBeenCalled();
    onMessage?.({ data: { type: "SKIP_WAITING" } });
    expect(sw.skipWaiting).toHaveBeenCalledTimes(1);
  });
});

describe("handleNavigation", () => {
  it("caches a navigation response under its path key, one entry per path", async () => {
    const sw = loadServiceWorker();
    const responses = await Promise.all([
      sw.handleNavigation(request("/models?tab=bench", { mode: "navigate" })),
      sw.handleNavigation(request("/models?tab=cost", { mode: "navigate" })),
      sw.handleNavigation(request("/releases", { mode: "navigate" })),
    ]);
    expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(sw.put.mock.calls.map(([key]) => key)).toEqual([
      `${ORIGIN}/models`,
      `${ORIGIN}/models`,
      `${ORIGIN}/releases`,
    ]);
  });
});
