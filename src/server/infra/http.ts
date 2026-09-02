import { USER_AGENT, PROBE_TIMEOUT_MS } from "@/shared/config";
import { UpstreamError } from "@/server/infra/errors";

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
    const length = res.headers.get("content-length");
    if (length && Number(length) > MAX_JSON_BYTES) {
      void res.body?.cancel()?.catch(() => {});
      throw new UpstreamError(`Upstream payload too large for ${url}`);
    }
    const body = await res.text();
    if (new TextEncoder().encode(body).length > MAX_JSON_BYTES)
      throw new UpstreamError(`Upstream payload too large for ${url}`);
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
    }
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    const res = await this.doFetch(url, init ?? {}, "text/html,application/xhtml+xml,*/*");
    const length = res.headers.get("content-length");
    if (length && Number(length) > maxBytes) {
      void res.body?.cancel()?.catch(() => {});
      throw new UpstreamError(`Upstream payload too large for ${url}`);
    }
    const body = await res.text();
    if (new TextEncoder().encode(body).length > maxBytes)
      throw new UpstreamError(`Upstream payload too large for ${url}`);
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
