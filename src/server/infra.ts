import { USER_AGENT, PROBE_TIMEOUT_MS, ONE_DAY } from "@/shared/config";

/** Base class for errors mapped to an HTTP status by the API error handler. */
export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

export class ValidationError extends ApiError {
  constructor(msg: string) {
    super(msg, 400);
    this.name = "ValidationError";
  }
}

/** A third-party source failed — surfaced as 502. */
export class UpstreamError extends ApiError {
  constructor(msg: string) {
    super(msg, 502);
    this.name = "UpstreamError";
  }
}

/** Rate limit exceeded — surfaced as 429. */
export class RateLimitError extends ApiError {
  constructor(msg: string = "Too many requests, please retry later") {
    super(msg, 429);
    this.name = "RateLimitError";
  }
}

export const settled = <T>(r: PromiseSettledResult<T>, f: T): T => (r.status === "fulfilled" ? r.value : f);
export const errMsg = (e: unknown): string => (e instanceof Error ? e.message : String(e));
export const formatSettleErrors = (rs: readonly PromiseSettledResult<unknown>[], ls: readonly string[]): string =>
  rs
    .map((r, i) => (r.status === "rejected" ? `${ls[i] ?? i}: ${errMsg(r.reason)}` : null))
    .filter(Boolean)
    .join("; ");

interface NumberSpec {
  type: "number";
  default?: string;
  min?: number;
  max?: number;
  integer?: boolean;
}
interface EnumSpec<V extends string = string> {
  type: "enum";
  values: readonly V[];
  default?: V;
}
type QuerySpec = NumberSpec | EnumSpec;
export type QuerySchema = Record<string, QuerySpec>;

export const qEnum = <const V extends string>(values: readonly V[], d?: V): EnumSpec<V> => ({
  type: "enum",
  values,
  ...(d === undefined ? {} : { default: d }),
});
export const qNum = (o: { default?: string; min?: number; max?: number; integer?: boolean } = {}): NumberSpec => ({
  type: "number",
  ...o,
});

type SpecValue<S extends QuerySpec> = S extends EnumSpec<infer V> ? V : number;
export type ValidatedQuery<S extends QuerySchema> = { [K in keyof S]: SpecValue<S[K]> };

export function validateQuery<S extends QuerySchema>(
  raw: Record<string, string | string[]>,
  schema: S,
): ValidatedQuery<S> {
  const out: Record<string, unknown> = {};
  for (const [name, spec] of Object.entries(schema)) {
    // First value wins: explicit and resistant to ?x=good&x=evil pollution.
    const rawVal = raw[name];
    const rawStr = Array.isArray(rawVal) ? (rawVal[0] ?? "") : (rawVal ?? "");
    let v: string | undefined = rawStr.trim();
    if (!v) v = spec.default;
    if (v === undefined) continue;
    // Guard against oversized values (potential DoS).
    if (v.length > 500) throw new ValidationError(`Query param "${name}" is too long`);
    if (spec.type === "number") {
      // Strict decimal only: reject hex (0x64), scientific (1e2), etc.
      if (!/^[+-]?(\d+(\.\d+)?)$/.test(v)) {
        throw new ValidationError(`Query param "${name}" must be a number`);
      }
      const n = Number(v);
      if (!Number.isFinite(n)) throw new ValidationError(`Query param "${name}" must be a number`);
      if (spec.integer && !Number.isInteger(n)) throw new ValidationError(`Query param "${name}" must be an integer`);
      if (spec.min != null && n < spec.min) throw new ValidationError(`Query param "${name}" must be >= ${spec.min}`);
      if (spec.max != null && n > spec.max) throw new ValidationError(`Query param "${name}" must be <= ${spec.max}`);
      out[name] = n;
    } else if (!(spec.values as readonly string[]).includes(v)) {
      throw new ValidationError(`Query param "${name}" must be one of: ${spec.values.join(", ")}`);
    } else out[name] = v;
  }
  return out as ValidatedQuery<S>;
}

interface FetchOptions extends RequestInit {
  timeoutMs?: number;
  retries?: number;
}

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

/** Cap against unexpectedly large upstream payloads. */
const MAX_JSON_BYTES = 5 * 1024 * 1024;

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const secs = Number(raw.trim());
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 5) * 1000;
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 5_000);
  return null;
}

function buildHeaders(userAgent: string, accept: string, initHeaders?: HeadersInit): Record<string, string> {
  let extra: Record<string, string> = {};
  if (initHeaders instanceof Headers) {
    extra = Object.fromEntries(initHeaders.entries());
  } else if (Array.isArray(initHeaders)) {
    extra = Object.fromEntries(initHeaders);
  } else if (initHeaders) {
    extra = initHeaders as Record<string, string>;
  }
  return {
    "user-agent": userAgent,
    accept,
    ...extra,
  };
}

function assertContentLength(url: string, res: Response, contentLength: string | null, maxBytes: number): void {
  if (!contentLength) return;
  const trimmed = contentLength.trim();
  // Only honor plain byte counts; ignore malformed values (body check is authoritative).
  if (!/^\d+$/.test(trimmed)) return;
  if (Number(trimmed) > maxBytes) {
    // Release the connection before throwing: a dangling body exhausts the
    // Workers subrequest connection pool under sustained large payloads.
    void res.body?.cancel()?.catch(() => {});
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
}

function assertBodySize(url: string, body: string, maxBytes: number): void {
  if (new TextEncoder().encode(body).length > maxBytes) {
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
}

/**
 * Read a response body as text, converting transport failures into
 * UpstreamError (502 + stale-cache fallback instead of generic 500).
 */
async function readBodyText(res: Response, url: string): Promise<string> {
  try {
    return await res.text();
  } catch (e) {
    void res.body?.cancel()?.catch(() => {});
    throw new UpstreamError(`Upstream body read failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export class HttpClient {
  private userAgent: string;
  private timeoutMs: number;
  private defaultRetries: number;
  /** Route-level abort (25s hono timeout): stops sleeping/fetching early. */
  private defaultSignal?: AbortSignal;
  constructor(opts?: { userAgent?: string; timeoutMs?: number; retries?: number; signal?: AbortSignal }) {
    this.userAgent = opts?.userAgent ?? USER_AGENT;
    this.timeoutMs = opts?.timeoutMs ?? 10_000;
    this.defaultRetries = opts?.retries ?? 0;
    this.defaultSignal = opts?.signal;
  }

  private async doFetch(url: string, init: FetchOptions, accept: string): Promise<Response> {
    const {
      timeoutMs = this.timeoutMs,
      retries = this.defaultRetries,
      headers: initHeaders,
      signal: initSignalOpt,
      ...rest
    } = init;
    // Per-call signal wins; otherwise fall back to the route-level signal so
    // a timed-out route doesn't leave upstream fetches and backoff sleeps
    // idling the Worker.
    const initSignal = initSignalOpt ?? this.defaultSignal;
    const headers = buildHeaders(this.userAgent, accept, initHeaders);
    // Abort-aware sleep: if the route already timed out, don't idle the worker.
    const sleepAbortable = (ms: number): Promise<void> =>
      new Promise((resolve) => {
        if (initSignal?.aborted) {
          resolve();
          return;
        }
        const t = setTimeout(() => {
          initSignal?.removeEventListener("abort", onAbort);
          resolve();
        }, ms);
        const onAbort = (): void => {
          clearTimeout(t);
          resolve();
        };
        initSignal?.addEventListener("abort", onAbort, { once: true });
      });
    for (let attempt = 0; attempt <= retries; attempt++) {
      const signal = initSignal
        ? AbortSignal.any([initSignal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      let res: Response;
      try {
        res = await fetch(url, { headers, signal, ...rest });
      } catch (e) {
        const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
        const msg = timedOut ? `Upstream timeout for ${url}` : `Upstream network error for ${url}`;
        if (attempt === retries) throw new UpstreamError(msg);
        const delay = 500 * 2 ** attempt + Math.random() * 250;
        await sleepAbortable(delay);
        if (initSignal?.aborted) throw new UpstreamError(`Upstream timeout for ${url}`);
        continue;
      }
      if (res.ok) return res;
      void res.body?.cancel()?.catch(() => {});
      const isClientError = res.status >= 400 && res.status < 500 && res.status !== 429;
      if (isClientError) throw new UpstreamError(`HTTP ${res.status} for ${url}`);
      if (attempt === retries) throw new UpstreamError(`HTTP ${res.status} for ${url}`);
      // Exponential backoff with jitter; honor Retry-After on 429.
      const retryAfter = res.status === 429 ? parseRetryAfterMs(res) : null;
      const delay = retryAfter ?? 500 * 2 ** attempt + Math.random() * 250;
      await sleepAbortable(delay);
      if (initSignal?.aborted) throw new UpstreamError(`Upstream timeout for ${url}`);
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  async json<T>(url: string, init?: FetchOptions): Promise<T> {
    const res = await this.doFetch(url, init ?? {}, "application/json");
    assertContentLength(url, res, res.headers.get("content-length"), MAX_JSON_BYTES);
    const body = await readBodyText(res, url);
    assertBodySize(url, body, MAX_JSON_BYTES);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
    }
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    const res = await this.doFetch(url, init ?? {}, "text/html,application/xhtml+xml,*/*");
    assertContentLength(url, res, res.headers.get("content-length"), maxBytes);
    const body = await readBodyText(res, url);
    assertBodySize(url, body, maxBytes);
    return body;
  }

  async probe(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const started = Date.now();
    const signal = AbortSignal.timeout(timeoutMs);
    try {
      const res = await fetch(url, {
        headers: buildHeaders(this.userAgent, "*/*"),
        signal,
        cache: "no-store",
      });
      const latencyMs = Date.now() - started;
      void res.body?.cancel()?.catch(() => {});
      return { ok: res.ok, status: res.status, latencyMs, error: res.ok ? null : `HTTP ${res.status}` };
    } catch (e) {
      const latencyMs = Date.now() - started;
      const timedOut = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
      return { ok: false, status: null, latencyMs, error: timedOut ? "timeout" : "network error" };
    }
  }
}

/**
 * KV entries carry a soft expiry inside the payload and a hard expirationTtl
 * of ttl + stale window. Soft-expired entries refresh on read; if the refresh
 * fails, the stale payload is served instead of failing.
 */
const STALE_WINDOW_MS = ONE_DAY;

interface StaleEnvelope<T> {
  d: T;
  e: number;
}

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  return typeof v === "object" && v !== null && "d" in v && "e" in v && typeof (v as StaleEnvelope<T>).e === "number";
}

// Module-level inflight map: CacheService is per-request, so a shared map
// dedupes concurrent refreshes within one isolate.
const globalInflight = new Map<string, Promise<unknown>>();

// In-isolate L1 cache: absorbs repeated reads and keeps the no-KV deploy from
// fanning out to upstreams on every request. Bounded by construction (~50 keys).
const memoryCache = new Map<string, StaleEnvelope<unknown>>();
const MEMORY_MAX_KEYS = 200;

function memoryGet<T>(vk: string): StaleEnvelope<T> | undefined {
  const hit = memoryCache.get(vk) as StaleEnvelope<T> | undefined;
  if (!hit) return undefined;
  if (!isEnvelope<T>(hit)) {
    memoryCache.delete(vk);
    return undefined;
  }
  return hit;
}

function memorySet(vk: string, data: unknown, ttl: number): void {
  // Refresh recency so the map behaves as LRU.
  if (memoryCache.has(vk)) memoryCache.delete(vk);
  if (memoryCache.size >= MEMORY_MAX_KEYS) {
    const now = Date.now();
    for (const [k, e] of memoryCache) {
      if (e.e <= now) memoryCache.delete(k);
      if (memoryCache.size < MEMORY_MAX_KEYS) break;
    }
    if (memoryCache.size >= MEMORY_MAX_KEYS) {
      const oldest = memoryCache.keys().next();
      if (!oldest.done) memoryCache.delete(oldest.value);
    }
  }
  memoryCache.set(vk, { d: data, e: Date.now() + ttl });
}

/** Short L1 cap when KV is present so edge isolates converge on fresh KV data. */
const L1_MAX_TTL_MS = 60_000;

/**
 * -10%..0 TTL jitter by key + random, so keys born in the same tick don't all
 * expire together AND different isolates don't stampede on the same key.
 * The hash component spreads different keys; the random component spreads the
 * same key across isolates.
 */
function jitteredTtl(vk: string, ttl: number): number {
  let h = 2166136261;
  for (let i = 0; i < vk.length; i++) {
    h ^= vk.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const hashPart = ((h >>> 0) % 50) / 1000; // 0..0.049
  const randomPart = Math.random() * 0.05; // 0..0.05
  const factor = 0.9 + hashPart + randomPart;
  return Math.max(60_000, Math.round(ttl * factor));
}

/** Test-only reset for the module-level L1 + inflight maps. */
export function resetModuleCachesForTests(): void {
  memoryCache.clear();
  globalInflight.clear();
}

export class CacheService {
  constructor(
    private kv: KVNamespace | undefined,
    private version: string,
  ) {}

  private vk(k: string): string {
    return `${this.version}:${k}`;
  }

  private async get<T>(k: string): Promise<T | undefined> {
    if (!this.kv) return undefined;
    // No edge cacheTtl: warmup writes must be visible immediately; KV is
    // already fast and the L1 absorbs repeated reads within the isolate.
    const raw = await this.kv.get(k, { type: "text" });
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return undefined;
    }
  }

  private async set<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    const envelope: StaleEnvelope<T> = { d: v, e: Date.now() + ttl };
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + STALE_WINDOW_MS) / 1000), 60), 2592000);
    await this.kv.put(k, JSON.stringify(envelope), { expirationTtl });
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const vk = this.vk(k);
    const mem = memoryGet<T>(vk);
    if (mem && mem.e > Date.now()) {
      // When KV is present the L1 is only a 60s read-through; verify against
      // KV on the slow path via refresh logic below. Fresh L1 still wins to
      // absorb hot reads, but it never outlives L1_MAX_TTL_MS (see refresh).
      return mem.d;
    }
    // No KV: same stale-fallback semantics against the L1.
    if (!this.kv) {
      if (!mem) return this.refresh(vk, ttl, fn);
      try {
        return await this.refresh(vk, ttl, fn);
      } catch {
        return mem.d;
      }
    }
    const hit = await this.get<StaleEnvelope<T>>(vk);
    if (!isEnvelope<T>(hit)) {
      if (hit === undefined) {
        return this.refresh(vk, ttl, fn);
      }
      // Corrupt or legacy KV value: try to refresh, but keep serving the old
      // payload if upstream is down instead of hard-failing.
      try {
        return await this.refresh(vk, ttl, fn);
      } catch {
        // Legacy shape may still carry usable data; best-effort serve it.
        return (hit as unknown as { d?: T }).d ?? (hit as unknown as T);
      }
    }
    if (hit.e > Date.now()) {
      // Refresh the short-lived L1 from the fresh KV hit.
      memorySet(vk, hit.d, Math.min(hit.e - Date.now(), L1_MAX_TTL_MS));
      return hit.d;
    }
    try {
      return await this.refresh(vk, ttl, fn);
    } catch {
      return hit.d; // soft-expired but upstream failed: serve stale
    }
  }

  private async refresh<T>(vk: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    // Dedupes concurrent refreshes of the same key within this isolate.
    const existing = globalInflight.get(vk) as Promise<T> | undefined;
    if (existing) return existing;
    const hasKv = !!this.kv;
    const p = (async () => {
      const { data, ttl: t } = await fn();
      const requested = t ?? ttl;
      const effective = jitteredTtl(vk, Number.isFinite(requested) && requested > 0 ? requested : ttl);
      // L1 first so a KV outage never discards fresh upstream data. With KV,
      // cap the L1 so isolates re-converge on KV quickly.
      memorySet(vk, data, hasKv ? Math.min(effective, L1_MAX_TTL_MS) : effective);
      try {
        await this.set(vk, data, effective);
      } catch {
        // KV write failures are non-fatal: L1 + stale fallback still serve.
      }
      // Corrupt legacy keys are cleaned only after a successful refresh.
      if (hasKv) {
        // No-op if the key is already a valid envelope (overwritten above).
      }
      return data;
    })();
    globalInflight.set(vk, p);
    try {
      return await p;
    } finally {
      globalInflight.delete(vk);
    }
  }
}
