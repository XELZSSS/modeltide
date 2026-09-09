import { MAX_JSON_BYTES, PROBE_TIMEOUT_MS, USER_AGENT } from "@/server/config";
import { utf8ByteLength } from "@/shared/utils";
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
  const secs = Number(raw.trim());
  if (Number.isFinite(secs) && secs >= 0) return Math.min(secs, 30) * 1000;
  const date = Date.parse(raw);
  if (Number.isFinite(date)) return Math.min(Math.max(date - Date.now(), 0), 30_000);
  return null;
}

function assertContentLength(url: string, res: Response, contentLength: string | null, maxBytes: number): void {
  if (!contentLength) return;
  const trimmed = contentLength.trim();
  if (!/^\d+$/.test(trimmed)) return;
  if (Number(trimmed) > maxBytes) {
    void res.body?.cancel()?.catch(() => {});
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
}

function assertBodySize(url: string, body: string, maxBytes: number): void {
  if (utf8ByteLength(body) > maxBytes) {
    throw new UpstreamError(`Upstream payload too large for ${url}`);
  }
}

function buildHeaders(userAgent: string, accept: string, extra?: Record<string, string>): Record<string, string> {
  return { "user-agent": userAgent, accept, ...extra };
}

function isTimeoutError(e: unknown): boolean {
  return e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError");
}

const BACKOFF_BASE_MS = 500;
const BACKOFF_MAX_MS = 2000;
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

async function readBodyText(res: Response, url: string, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) {
    try {
      return await res.text();
    } catch (e) {
      throw new UpstreamError(`Upstream body read failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
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
    throw new UpstreamError(`Upstream body read failed for ${url}: ${e instanceof Error ? e.message : String(e)}`);
  } finally {
    reader.releaseLock();
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder().decode(merged);
}

export class HttpClient {
  private userAgent: string;
  private timeoutMs: number;
  private defaultRetries: number;
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
    const initSignal = initSignalOpt ?? this.defaultSignal;
    const headers = buildHeaders(this.userAgent, accept, initHeaders);
    for (let attempt = 0; attempt <= retries; attempt++) {
      const signal = initSignal
        ? AbortSignal.any([initSignal, AbortSignal.timeout(timeoutMs)])
        : AbortSignal.timeout(timeoutMs);
      let res: Response | null = null;
      let failMsg: string | null = null;
      let failStatus: number | null = null;
      let timedOut = false;
      try {
        res = await fetch(url, { headers, signal, ...rest });
      } catch (e) {
        if (initSignal?.aborted) throw new UpstreamError(`Upstream request aborted for ${url}`);
        timedOut = isTimeoutError(e);
        failMsg = timedOut ? `Upstream timeout for ${url}` : `Upstream network error for ${url}`;
      }
      let retryAfter: number | null = null;
      if (res) {
        if (res.ok) return res;
        void res.body?.cancel()?.catch(() => {});
        if (res.status >= 400 && res.status < 500 && res.status !== 429) {
          throw new UpstreamError(`HTTP ${res.status} for ${url}`, { status: res.status });
        }
        retryAfter = res.status === 429 ? parseRetryAfterMs(res) : null;
        failMsg = `HTTP ${res.status} for ${url}`;
        failStatus = res.status;
        timedOut = false;
      }
      if (attempt === retries)
        throw new UpstreamError(failMsg!, timedOut ? { timeout: true } : { status: failStatus ?? undefined });
      const delay = retryAfter ?? computeBackoff(attempt);
      await sleepAbortable(delay, initSignal);
      if (initSignal?.aborted) throw new UpstreamError(`Upstream request aborted for ${url}`);
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  async json<T>(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
    const res = await this.doFetch(url, init ?? {}, "application/json");
    assertContentLength(url, res, res.headers.get("content-length"), maxBytes);
    const body = await readBodyText(res, url, maxBytes);
    assertBodySize(url, body, maxBytes);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
    }
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    const res = await this.doFetch(url, init ?? {}, "text/html,application/xhtml+xml,*/*");
    assertContentLength(url, res, res.headers.get("content-length"), maxBytes);
    const body = await readBodyText(res, url, maxBytes);
    assertBodySize(url, body, maxBytes);
    return body;
  }

  async probe(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const started = Date.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = this.defaultSignal ? AbortSignal.any([this.defaultSignal, timeout]) : timeout;
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
