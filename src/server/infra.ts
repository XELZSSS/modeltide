import { USER_AGENT, PROBE_TIMEOUT_MS, ONE_DAY } from "@/shared/config";

/** Base class for errors that map to a specific HTTP status in the API error handler. */
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

/** A third-party data source failed (network, bad status, or unparseable payload) — surfaced as 502 instead of a generic 500. */
export class UpstreamError extends ApiError {
  constructor(msg: string) {
    super(msg, 502);
    this.name = "UpstreamError";
  }
}

/** The client exceeded a route's rate limit — surfaced as 429. */
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
    // Trim before the empty check so whitespace-only params ("%20") fall back to
    // the default instead of reaching Number("") === 0 below.
    const rawVal = raw[name];
    const rawStr = Array.isArray(rawVal) ? (rawVal[0] ?? "") : (rawVal ?? "");
    let v: string | undefined = rawStr.trim();
    if (!v) v = spec.default;
    // Params without a default are optional: omit them so callers see an absent key.
    if (v === undefined) continue;
    // Guard against oversized values (potential DoS).
    if (v.length > 500) throw new ValidationError(`Query param "${name}" is too long`);
    if (spec.type === "number") {
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

/** Guard against OOM from unexpectedly large upstream payloads (RSS/RSC already cap at 2M/5M). */
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

function assertContentLength(url: string, contentLength: string | null, maxBytes: number): void {
  if (contentLength && Number(contentLength) > maxBytes) {
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
}

function assertBodySize(url: string, body: string, maxBytes: number): void {
  if (new TextEncoder().encode(body).length > maxBytes) {
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
}

/**
 * Read a response body as text, converting transport-level failures
 * ("Network connection lost" mid-body on large RSC payloads, etc.) into
 * UpstreamError so the API maps them to 502 + stale-cache fallback
 * instead of the generic 500 unhandled path.
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
  constructor(opts?: { userAgent?: string; timeoutMs?: number; retries?: number }) {
    this.userAgent = opts?.userAgent ?? USER_AGENT;
    this.timeoutMs = opts?.timeoutMs ?? 10_000;
    this.defaultRetries = opts?.retries ?? 0;
  }

  private async doFetch(url: string, init: FetchOptions, accept: string): Promise<Response> {
    const {
      timeoutMs = this.timeoutMs,
      retries = this.defaultRetries,
      headers: initHeaders,
      signal: initSignal,
      ...rest
    } = init;
    const headers = buildHeaders(this.userAgent, accept, initHeaders);
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
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (res.ok) return res;
      // Release the unread body so the Workers runtime does not hold the subrequest open across retries
      void res.body?.cancel()?.catch(() => {});
      const isClientError = res.status >= 400 && res.status < 500 && res.status !== 429;
      if (isClientError) throw new UpstreamError(`HTTP ${res.status} for ${url}`);
      if (attempt === retries) throw new UpstreamError(`HTTP ${res.status} for ${url}`);
      // Gentler exponential backoff with jitter; honor Retry-After on 429 so we
      // don't hammer rate-limited upstreams with 100ms retries.
      const retryAfter = res.status === 429 ? parseRetryAfterMs(res) : null;
      const delay = retryAfter ?? 500 * 2 ** attempt + Math.random() * 250;
      await new Promise((r) => setTimeout(r, delay));
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  async json<T>(url: string, init?: FetchOptions): Promise<T> {
    const res = await this.doFetch(url, init ?? {}, "application/json");
    // Header pre-check first: refuse oversized bodies without reading them into memory.
    assertContentLength(url, res.headers.get("content-length"), MAX_JSON_BYTES);
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
    // Header pre-check first: refuse oversized bodies without reading them into memory.
    assertContentLength(url, res.headers.get("content-length"), maxBytes);
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
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      return { ok: false, status: null, latencyMs, error: timedOut ? "timeout" : "network error" };
    }
  }
}

/**
 * KV entries get a hard expirationTtl of ttl + STALE_WINDOW_MS and carry a soft
 * expiry timestamp inside the payload. A soft-expired entry is refreshed on read;
 * if the upstream refresh fails, the stale payload is served instead of failing
 * (mirrors the CDN stale-if-error=ONE_DAY policy in routes/registry.ts).
 */
const STALE_WINDOW_MS = ONE_DAY;

interface StaleEnvelope<T> {
  d: T;
  e: number;
}

function isEnvelope<T>(v: unknown): v is StaleEnvelope<T> {
  return typeof v === "object" && v !== null && "d" in v && "e" in v && typeof (v as StaleEnvelope<T>).e === "number";
}

// Module-level inflight map: CacheService is constructed per-request
// (see buildContext), so an instance field cannot dedupe concurrent
// requests. A shared map merges thundering-herd refreshes within one isolate.
const globalInflight = new Map<string, Promise<unknown>>();

// In-isolate L1 cache: without KV every request would fan out to upstreams
// (AA = 4 fetches, news = 6, official-pricing = 8…), so any traffic spike turns
// into upstream timeouts and 504s. The L1 honors the same soft TTLs, costs no
// KV writes, and absorbs repeated KV reads when KV is configured.
// Bounded by construction: keys are the fixed route key set (~50 with the
// sort/limit buckets); values are shared references to already-built payloads.
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
  if (!memoryCache.has(vk) && memoryCache.size >= MEMORY_MAX_KEYS) {
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

/**
 * Deterministic -10%..0 TTL jitter by key: without it every key born in the same
 * warmup tick expires in the same tick, so the slow/static tiers would re-burst
 * together and risk overrunning the cron invocation. Hash-based (not random)
 * so every isolate agrees on each key's schedule. Shorten-only so a jittered
 * TTL never outlives its tier's retry bound (e.g. partial-fail stays ≤ 5m).
 */
function jitteredTtl(vk: string, ttl: number): number {
  let h = 2166136261;
  for (let i = 0; i < vk.length; i++) {
    h ^= vk.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const factor = 0.9 + ((h >>> 0) % 100) / 1000;
  return Math.max(60_000, Math.round(ttl * factor));
}

/**
 * Test-only reset: the module-level L1 + inflight maps outlive the per-test KV
 * reset in workerd, so suites that assert refetch counts must clear them.
 */
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
    // NOTE: edge cacheTtl=30s may serve a pre-refresh envelope for up to 30s
    // after a refresh, effectively extending the soft TTL by 30s. Acceptable
    // for dashboard data; keeps KV reads cheap.
    const raw = await this.kv.get(k, { type: "text", cacheTtl: 30 });
    if (!raw) return undefined;
    try {
      return JSON.parse(raw) as T;
    } catch {
      // Corrupted entry (truncated write, version residue): treat as miss so the
      // key can self-heal on the next refresh instead of failing every request.
      return undefined;
    }
  }

  private async set<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    const envelope: StaleEnvelope<T> = { d: v, e: Date.now() + ttl };
    const expirationTtl = Math.min(Math.max(Math.ceil((ttl + STALE_WINDOW_MS) / 1000), 60), 2592000);
    await this.kv.put(k, JSON.stringify(envelope), { expirationTtl });
  }

  async setSafe<T>(k: string, v: T, ttl: number): Promise<void> {
    if (!this.kv) return;
    if (!Number.isFinite(ttl) || ttl <= 0) return;
    await this.set(this.vk(k), v, ttl);
  }

  async withTtl<T>(k: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    const vk = this.vk(k);
    // L1 first: fresh memory hits skip KV and upstream entirely.
    const mem = memoryGet<T>(vk);
    if (mem && mem.e > Date.now()) return mem.d;
    // No KV: same stale-fallback semantics against the L1 instead of refetching
    // upstream on every request (the default deploy has no KV binding).
    if (!this.kv) {
      if (!mem) return this.refresh(vk, ttl, fn);
      try {
        return await this.refresh(vk, ttl, fn);
      } catch {
        return mem.d;
      }
    }
    const hit = await this.get<StaleEnvelope<T>>(vk);
    if (hit !== undefined) {
      if (!isEnvelope<T>(hit)) return hit; // legacy unwrapped entry, still within its hard TTL
      if (hit.e > Date.now()) return hit.d;
      try {
        return await this.refresh(vk, ttl, fn);
      } catch {
        return hit.d; // soft-expired but upstream failed: serve stale
      }
    }
    return this.refresh(vk, ttl, fn);
  }

  private async refresh<T>(vk: string, ttl: number, fn: () => Promise<{ data: T; ttl?: number }>): Promise<T> {
    // Dedupes concurrent refreshes of the same key within this isolate
    // (shared map — see globalInflight above, not per-request state).
    const existing = globalInflight.get(vk) as Promise<T> | undefined;
    if (existing) return existing;
    const p = (async () => {
      const { data, ttl: t } = await fn();
      const effective = jitteredTtl(vk, t ?? ttl);
      await this.set(vk, data, effective);
      memorySet(vk, data, effective);
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
