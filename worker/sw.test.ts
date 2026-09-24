import fs from "node:fs";
import { fileURLToPath, URL } from "node:url";
import { describe, expect, it, vi } from "vitest";

const ORIGIN = "https://example.test";
const SW_PATH = fileURLToPath(new URL("../public/sw.js", import.meta.url));
const SW_SOURCE = fs.readFileSync(SW_PATH, "utf8");

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
  handleNavigation: (event: SwEvent) => Promise<Response>;
}

interface SwEvent {
  request: SwRequest;
  waitUntil: (work: unknown) => void;
}

type Handler = (event: { data?: unknown }) => void;

function request(path: string, over: Partial<SwRequest> = {}): SwRequest {
  return { url: `${ORIGIN}${path}`, method: "GET", ...over };
}

function navigation(path: string): SwEvent {
  return { request: request(path, { mode: "navigate" }), waitUntil: () => {} };
}

function loadServiceWorker(source = SW_SOURCE, fetchImpl?: () => Promise<Response>) {
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
  const api = evaluate(self, caches, fetchImpl ?? vi.fn(async () => new Response("shell", { status: 200 })));
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
  it("passes the network response through without caching it", async () => {
    const sw = loadServiceWorker();
    const responses = await Promise.all([
      sw.handleNavigation(navigation("/models?tab=bench")),
      sw.handleNavigation(navigation("/models?tab=cost")),
      sw.handleNavigation(navigation("/releases")),
    ]);
    expect(responses.map((res) => res.status)).toEqual([200, 200, 200]);
    expect(sw.put).not.toHaveBeenCalled();
  });

  it("answers 503 when the network fails and no shell is cached", async () => {
    const sw = loadServiceWorker(SW_SOURCE, async () => {
      throw new Error("offline");
    });
    const res = await sw.handleNavigation(navigation("/models"));
    expect(res.status).toBe(503);
  });
});
