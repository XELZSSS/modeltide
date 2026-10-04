import { MAX_JSON_BYTES, PROBE_TIMEOUT_MS, USER_AGENT } from "@/server/config";
import { UpstreamError } from "@/server/infra/errors";
import { acquireSlot, releaseSlot, poolFor } from "@/server/infra/connection-pool";
import { fetchBodyText, parseJsonBody, type JsonResponse } from "@/server/infra/body-readers";
import { parseRetryAfterMs, computeBackoff, sleepAbortable } from "@/server/infra/retry";

export interface FetchOptions extends Omit<RequestInit, "headers"> {
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

function buildHeaders(userAgent: string, accept: string, extra?: Record<string, string>): Record<string, string> {
  return { "user-agent": userAgent, accept, ...extra };
}

function isSubrequestLimit(err: unknown): boolean {
  const msg = err instanceof Error ? err.message : String(err ?? "");
  return msg.includes("Too many subrequests") || msg.includes("subrequest");
}

// fetch() never mutates the headers object it is given, so a shared probe header set is safe.
const PROBE_HEADERS: Record<string, string> = { "user-agent": USER_AGENT, accept: "*/*" };

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
    const pool = poolFor(this.background);
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
    const pool = poolFor(this.background);
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
          headers: PROBE_HEADERS,
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
