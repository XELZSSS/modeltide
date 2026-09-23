import { BACKOFF_MAX_MS, MAX_JSON_BYTES, PROBE_TIMEOUT_MS, USER_AGENT } from "@/server/config";
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
  const CAP_MS = 2_000;
  // `Retry-After: 0`/blank means retry now, skipping backoff when it's needed most.
  const trimmed = raw.trim();
  const secs = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(secs) && secs >= 0) {
    return Math.min(secs, CAP_MS / 1000) * 1000;
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delay = Math.min(Math.max(date - Date.now(), 0), CAP_MS);
    return delay > 0 ? delay : null;
  }
  return null;
}

function buildHeaders(userAgent: string, accept: string, extra?: Record<string, string>): Record<string, string> {
  return { "user-agent": userAgent, accept, ...extra };
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
    // Keep the timeout flag, or a stalled body reports 502 and cools down as non-timeout.
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
  constructor(opts?: { signal?: AbortSignal }) {
    this.defaultSignal = opts?.signal;
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
      } catch {
        // Only AbortSignal.timeout and the cron deadline abort here, never a client disconnect.
        timedOut = signal.aborted;
        failMsg = timedOut ? `Upstream timeout for ${url}` : `Upstream network error for ${url}`;
      }
      let retryAfter: number | null = null;
      if (res) {
        if (res.ok) {
          try {
            // Read inside the retry loop: a 200 can still fail halfway through its body stream.
            return await read(res, signal);
          } catch (err) {
            if (!(err instanceof UpstreamError) || !err.retryable || signal.aborted || initSignal?.aborted) throw err;
            failMsg = err.message;
            failStatus = null;
            timedOut = false;
          }
        } else {
          void res.body?.cancel()?.catch(() => {});
          if (res.status >= 400 && res.status < 500 && res.status !== 429 && res.status !== 408) {
            throw new UpstreamError(`HTTP ${res.status} for ${url}`, { status: res.status });
          }
          retryAfter = res.status === 429 ? parseRetryAfterMs(res) : null;
          failMsg = `HTTP ${res.status} for ${url}`;
          failStatus = res.status;
          timedOut = false;
        }
      }
      if (attempt === retries)
        throw new UpstreamError(failMsg!, timedOut ? { timeout: true } : { status: failStatus ?? undefined });
      const delay = retryAfter ?? computeBackoff(attempt);
      await sleepAbortable(delay, initSignal);
      if (initSignal?.aborted) {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  async json<T>(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
    return this.doFetch(url, init ?? {}, "application/json", async (res, signal) => {
      const body = await fetchBodyText(url, res, maxBytes, signal);
      try {
        return JSON.parse(body) as T;
      } catch {
        throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
      }
    });
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    return this.doFetch(url, init ?? {}, "text/html,application/xhtml+xml,*/*", (res, signal) =>
      fetchBodyText(url, res, maxBytes, signal),
    );
  }

  async probe(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const started = Date.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = this.defaultSignal ? AbortSignal.any([this.defaultSignal, timeout]) : timeout;
    try {
      const res = await fetch(url, {
        headers: buildHeaders(USER_AGENT, "*/*"),
        signal,
        cache: "no-store",
      });
      const latencyMs = Date.now() - started;
      void res.body?.cancel()?.catch(() => {});
      return { ok: res.ok, status: res.status, latencyMs, error: res.ok ? null : `HTTP ${res.status}` };
    } catch {
      const latencyMs = Date.now() - started;
      if (this.defaultSignal?.aborted) return { ok: false, status: null, latencyMs, error: "aborted" };
      return { ok: false, status: null, latencyMs, error: timeout.aborted ? "timeout" : "network error" };
    }
  }
}
