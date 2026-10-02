import {
  BACKOFF_MAX_MS,
  MAX_JSON_BYTES,
  PROBE_TIMEOUT_MS,
  RETRY_AFTER_MAX_MS,
  UPSTREAM_BACKGROUND_SLOTS,
  UPSTREAM_MAX_CONNECTIONS,
  USER_AGENT,
} from "@/server/config";
import { utf8ByteLength } from "@/server/infra/hash";
import { UpstreamError } from "@/server/infra/errors";

interface FetchOptions extends Omit<RequestInit, "headers"> {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
}

export interface ProbeResult {
  ok: boolean;
  status: number | null;
  latencyMs: number | null;
  error: string | null;
}

function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const trimmed = raw.trim();
  const secs = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(secs) && secs >= 0) {
    const ms = Math.min(secs, RETRY_AFTER_MAX_MS / 1000) * 1000;
    return ms > 0 ? ms : null;
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delay = Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_MAX_MS);
    return delay > 0 ? delay : null;
  }
  return null;
}

function buildHeaders(userAgent: string, accept: string, extra?: Record<string, string>): Record<string, string> {
  return { "user-agent": userAgent, accept, ...extra };
}

function isSubrequestLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("Too many subrequests") || msg.includes("subrequest");
}

async function fetchBodyText(url: string, res: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  const contentLength = res.headers.get("content-length")?.trim();
  if (contentLength && /^\d+$/.test(contentLength) && Number(contentLength) > maxBytes) {
    void res.body?.cancel()?.catch(() => {});
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
  const { text, bytes } = await readBodyText(res, url, maxBytes, signal);
  if (bytes > maxBytes) {
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
  return text;
}

interface JsonResponse<T> {
  status: number;
  body: T;
}

async function parseJsonBody<T>(url: string, res: Response, maxBytes: number, signal: AbortSignal): Promise<T> {
  const body = await fetchBodyText(url, res, maxBytes, signal);
  try {
    return JSON.parse(body) as T;
  } catch {
    throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
  }
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_JITTER_MS = 250;

function computeBackoff(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt + Math.random() * BACKOFF_JITTER_MS, BACKOFF_MAX_MS);
}

function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

interface SlotWaiter {
  resolve: () => void;
  detach: () => void;
}

interface SlotPool {
  active: number;
  waiters: SlotWaiter[];
  max: number;
}

const interactivePool: SlotPool = { active: 0, waiters: [], max: UPSTREAM_MAX_CONNECTIONS };
const backgroundPool: SlotPool = { active: 0, waiters: [], max: UPSTREAM_BACKGROUND_SLOTS };

function poolLimit(pool: SlotPool): number {
  const other = pool === backgroundPool ? interactivePool : backgroundPool;
  return Math.max(0, Math.min(pool.max, UPSTREAM_MAX_CONNECTIONS - other.active));
}

function wakeWaiters(pool: SlotPool): void {
  while (pool.waiters.length > 0 && pool.active < poolLimit(pool)) {
    const next = pool.waiters.shift()!;
    next.detach();
    pool.active += 1;
    next.resolve();
  }
}

function acquireSlot(signal: AbortSignal | undefined, pool: SlotPool): Promise<void> {
  if (signal?.aborted) return Promise.reject(signal.reason);
  if (pool.active < poolLimit(pool)) {
    pool.active += 1;
    return Promise.resolve();
  }
  return new Promise<void>((resolve, reject) => {
    const waiter: SlotWaiter = { resolve, detach: () => {} };
    if (signal) {
      const onAbort = (): void => {
        const i = pool.waiters.indexOf(waiter);
        if (i !== -1) pool.waiters.splice(i, 1);
        reject(signal.reason);
      };
      waiter.detach = () => signal.removeEventListener("abort", onAbort);
      signal.addEventListener("abort", onAbort, { once: true });
    }
    pool.waiters.push(waiter);
  });
}

function releaseSlot(pool: SlotPool): void {
  pool.active -= 1;
  wakeWaiters(pool);
  wakeWaiters(pool === backgroundPool ? interactivePool : backgroundPool);
}

async function readBodyText(
  res: Response,
  url: string,
  maxBytes: number,
  signal: AbortSignal,
): Promise<{ text: string; bytes: number }> {
  const body = res.body;
  if (!body) {
    try {
      const text = await res.text();
      return { text, bytes: utf8ByteLength(text) };
    } catch (e) {
      throw new UpstreamError(
        `Upstream body read failed for ${url}: ${e instanceof Error ? e.message : String(e)}`,
        signal.aborted ? { timeout: true } : { retryable: true },
      );
    }
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        total += value.byteLength;
        if (total > maxBytes) {
          await reader.cancel().catch(() => {});
          throw new UpstreamError(`Upstream payload too large for ${url}`);
        }
        chunks.push(value);
      }
    }
  } catch (e) {
    if (e instanceof UpstreamError) throw e;
    await reader.cancel().catch(() => {});
    throw new UpstreamError(
      `Upstream body read failed for ${url}: ${e instanceof Error ? e.message : String(e)}`,
      signal.aborted ? { timeout: true } : { retryable: true },
    );
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return { text: new TextDecoder().decode(merged), bytes: total };
}

export class HttpClient {
  private defaultSignal?: AbortSignal;
  private background: boolean;
  constructor(opts?: { signal?: AbortSignal; background?: boolean }) {
    this.defaultSignal = opts?.signal;
    this.background = opts?.background === true;
  }

  private async doFetch<T>(
    url: string,
    init: FetchOptions,
    accept: string,
    read: (res: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const { timeoutMs = 10_000, retries = 0, headers: initHeaders, signal: initSignalOpt, ...rest } = init;
    const initSignal = initSignalOpt ?? this.defaultSignal;
    const headers = buildHeaders(USER_AGENT, accept, initHeaders);
    const pool = this.background ? backgroundPool : interactivePool;
    for (let attempt = 0; attempt <= retries; attempt++) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = initSignal ? AbortSignal.any([initSignal, deadline]) : deadline;
      try {
        await acquireSlot(signal, pool);
      } catch {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
      let res: Response | null = null;
      let failMsg: string | null = null;
      let failStatus: number | null = null;
      let timedOut = false;
      try {
        try {
          res = await fetch(url, { headers, signal, ...rest });
        } catch (err) {
          if (isSubrequestLimit(err)) throw new UpstreamError(`Subrequest limit hit for ${url}`, { retryable: false });
          timedOut = signal.aborted;
          failMsg = timedOut ? `Upstream timeout for ${url}` : `Upstream network error for ${url}`;
        }
        if (res) {
          if (res.ok) {
            try {
              return await read(res, signal);
            } catch (err) {
              if (!(err instanceof UpstreamError) || !err.retryable || signal.aborted || initSignal?.aborted) throw err;
              failMsg = err.message;
              failStatus = null;
              timedOut = false;
            }
          } else {
            void res.body?.cancel()?.catch(() => {});
            if (res.status === 429) {
              const retryAfterMs = parseRetryAfterMs(res);
              throw new UpstreamError(`HTTP ${res.status} for ${url}`, {
                status: res.status,
                ...(retryAfterMs != null ? { retryAfterMs } : {}),
              });
            }
            if (res.status >= 400 && res.status < 500 && res.status !== 408) {
              throw new UpstreamError(`HTTP ${res.status} for ${url}`, { status: res.status });
            }
            failMsg = `HTTP ${res.status} for ${url}`;
            failStatus = res.status;
            timedOut = false;
          }
        }
      } finally {
        releaseSlot(pool);
      }
      if (attempt === retries)
        throw new UpstreamError(
          failMsg!,
          timedOut ? { timeout: true } : failStatus != null ? { status: failStatus } : { retryable: true },
        );
      await sleepAbortable(computeBackoff(attempt), initSignal);
      if (initSignal?.aborted) {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  async json<T>(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
    return this.doFetch(url, init ?? {}, "application/json", (res, signal) =>
      parseJsonBody<T>(url, res, maxBytes, signal),
    );
  }

  async jsonWithStatus<T>(
    url: string,
    init?: FetchOptions,
    maxBytes: number = MAX_JSON_BYTES,
  ): Promise<JsonResponse<T>> {
    return this.doFetch(url, init ?? {}, "application/json", async (res, signal) => ({
      status: res.status,
      body: await parseJsonBody<T>(url, res, maxBytes, signal),
    }));
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    return this.doFetch(url, init ?? {}, "text/html,application/xhtml+xml,*/*", (res, signal) =>
      fetchBodyText(url, res, maxBytes, signal),
    );
  }

  async probe(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const queuedAt = Date.now();
    const pool = this.background ? backgroundPool : interactivePool;
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = this.defaultSignal ? AbortSignal.any([this.defaultSignal, timeout]) : timeout;
    try {
      await acquireSlot(signal, pool);
    } catch {
      return { ok: false, status: null, latencyMs: Date.now() - queuedAt, error: "aborted" };
    }
    try {
      const attemptStart = Date.now();
      try {
        const res = await fetch(url, {
          method: "HEAD",
          headers: buildHeaders(USER_AGENT, "*/*"),
          signal,
          cache: "no-store",
        });
        const latencyMs = Date.now() - attemptStart;
        void res.body?.cancel()?.catch(() => {});
        // 405/501 means the host is alive but rejects HEAD; a fallback GET would cost another subrequest.
        if (res.status === 405 || res.status === 501) {
          return { ok: true, status: res.status, latencyMs, error: null };
        }
        return { ok: res.ok, status: res.status, latencyMs, error: res.ok ? null : `HTTP ${res.status}` };
      } catch (err) {
        const latencyMs = Date.now() - attemptStart;
        if (isSubrequestLimit(err)) return { ok: false, status: null, latencyMs, error: "subrequest-limit" };
        if (this.defaultSignal?.aborted) return { ok: false, status: null, latencyMs, error: "aborted" };
        return { ok: false, status: null, latencyMs, error: timeout.aborted ? "timeout" : "network error" };
      }
    } finally {
      releaseSlot(pool);
    }
  }
}
