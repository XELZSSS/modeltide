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

function buildHeaders(userAgent: string, accept: string, initHeaders?: HeadersInit): Record<string, string> {
  return {
    "user-agent": userAgent,
    accept,
    ...(initHeaders as Record<string, string> | undefined),
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
    const { timeoutMs = this.timeoutMs, retries = this.defaultRetries, headers: initHeaders, signal: initSignal, ...rest } = init;
    const headers = buildHeaders(this.userAgent, accept, initHeaders);
    for (let attempt = 0; attempt <= retries; attempt++) {
      const signal = initSignal ? AbortSignal.any([initSignal, AbortSignal.timeout(timeoutMs)]) : AbortSignal.timeout(timeoutMs);
      const res = await fetch(url, { headers, signal, ...rest });
      if (res.ok) return res;
      // Release the unread body so the Workers runtime does not hold the subrequest open across retries
      res.body?.cancel();
      const isClientError = res.status >= 400 && res.status < 500 && res.status !== 429;
      if (isClientError) throw new UpstreamError(`HTTP ${res.status} for ${url}`);
      if (attempt === retries) throw new UpstreamError(`HTTP ${res.status} for ${url}`);
      // Short exponential backoff with jitter before the next attempt
      await new Promise((r) => setTimeout(r, 100 * 2 ** attempt + Math.random() * 100));
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  async json<T>(url: string, init?: FetchOptions): Promise<T> {
    const res = await this.doFetch(url, init ?? {}, "application/json");
    const body = await res.text();
    try {
      return JSON.parse(body) as T;
    } catch {
      throw new UpstreamError(`Upstream returned invalid JSON for ${url}`);
    }
  }

  async text(url: string, init?: FetchOptions): Promise<string> {
    const res = await this.doFetch(url, init ?? {}, "text/html,application/xhtml+xml,*/*");
    return res.text();
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
      res.body?.cancel();
      return { ok: res.ok, status: res.status, latencyMs, error: res.ok ? null : `HTTP ${res.status}` };
    } catch (e) {
      const latencyMs = Date.now() - started;
      const timedOut = e instanceof Error && e.name === "TimeoutError";
      return { ok: false, status: null, latencyMs, error: timedOut ? "timeout" : "network error" };
    }
  }
}
