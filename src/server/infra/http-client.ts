import { MAX_JSON_BYTES, PROBE_TIMEOUT_MS, UPSTREAM_FETCH_OPTS, USER_AGENT } from "@/server/config";
import { UpstreamError, errMsg } from "@/server/infra/errors";
import { acquireSlot, createSlotPools, releaseSlot, type SlotPool, type SlotPools } from "@/server/infra/connection-pool";
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
  const msg = errMsg(err);
  return msg.includes("Too many subrequests") || msg.includes("subrequest");
}

// fetch() rejections carry the real reason (DNS, TCP reset, TLS) on `message`/`cause`.
// Truncate so upstream logs stay readable while keeping the signal.
const FETCH_ERROR_DETAIL_MAX = 160;

function describeFetchError(err: unknown): string {
  const parts: string[] = [];
  const msg = errMsg(err);
  if (msg) parts.push(msg);
  if (err instanceof Error && err.cause != null) {
    const causeMsg = errMsg(err.cause);
    if (causeMsg && causeMsg !== msg) parts.push(`cause: ${causeMsg}`);
  }
  const joined = parts.join(" | ").slice(0, FETCH_ERROR_DETAIL_MAX);
  return joined || "unknown fetch failure";
}

// fetch() never mutates the headers object it is given, so a shared probe header set is safe.
const PROBE_HEADERS: Record<string, string> = { "user-agent": USER_AGENT, accept: "*/*" };

type ResponseOutcome =
  | { kind: "throw"; error: UpstreamError }
  | { kind: "retry"; message: string; status: number | null };

function classifyResponse(res: Response, url: string): ResponseOutcome {
  void res.body?.cancel()?.catch(() => {});
  if (res.status === 429) {
    const retryAfterMs = parseRetryAfterMs(res);
    return {
      kind: "throw",
      error: new UpstreamError(`HTTP ${res.status} for ${url}`, {
        status: res.status,
        retryable: false,
        ...(retryAfterMs != null ? { retryAfterMs } : {}),
      }),
    };
  }
  if (res.status >= 400 && res.status < 500 && res.status !== 408) {
    return { kind: "throw", error: new UpstreamError(`HTTP ${res.status} for ${url}`, { status: res.status }) };
  }
  return { kind: "retry", message: `HTTP ${res.status} for ${url}`, status: res.status };
}

export class HttpClient {
  private defaultSignal?: AbortSignal;
  private background: boolean;
  private fetchImpl: typeof fetch;
  private now: () => number;
  readonly pools: SlotPools;
  constructor(opts?: {
    signal?: AbortSignal;
    background?: boolean;
    fetchImpl?: typeof fetch;
    now?: () => number;
    pools?: SlotPools;
  }) {
    this.defaultSignal = opts?.signal;
    this.background = opts?.background === true;
    // Never store the global fetch by reference: in the Pages Functions
    // runtime it throws "Illegal invocation" when called with the wrong
    // `this`. The wrapper keeps the receiver correct and resolves fetch lazily per call.
    this.fetchImpl = opts?.fetchImpl ?? ((input, init) => fetch(input, init));
    this.now = opts?.now ?? Date.now;
    this.pools = opts?.pools ?? createSlotPools();
  }

  private pool(): SlotPool {
    return this.background ? this.pools.background : this.pools.interactive;
  }

  private async doFetch<T>(
    url: string,
    init: FetchOptions,
    accept: string,
    read: (res: Response, signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    const { timeoutMs, retries, headers: initHeaders, signal: initSignalOpt, ...rest } = init;
    if (timeoutMs == null || retries == null) {
      throw new UpstreamError(`FetchPolicy required for ${url}: pass timeoutMs + retries from fetchPolicy()`);
    }
    const initSignal = initSignalOpt ?? this.defaultSignal;
    const headers = buildHeaders(USER_AGENT, accept, initHeaders);
    const pool = this.pool();
    for (let attempt = 0; attempt <= retries; attempt++) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = initSignal ? AbortSignal.any([initSignal, deadline]) : deadline;
      try {
        await acquireSlot(signal, this.pools, pool);
      } catch {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
      let res: Response | null = null;
      let failMsg: string | null = null;
      let failCause: unknown;
      let failStatus: number | null = null;
      let timedOut = false;
      try {
        try {
          res = await this.fetchImpl(url, { headers, signal, ...rest });
        } catch (err) {
          if (isSubrequestLimit(err)) throw new UpstreamError(`Subrequest limit hit for ${url}`, { retryable: false });
          timedOut = signal.aborted;
          failCause = err;
          failMsg = timedOut
            ? `Upstream timeout for ${url}: ${describeFetchError(err)}`
            : `Upstream network error for ${url}: ${describeFetchError(err)}`;
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
            const outcome = classifyResponse(res, url);
            if (outcome.kind === "throw") throw outcome.error;
            failMsg = outcome.message;
            failStatus = outcome.status;
            timedOut = false;
          }
        }
      } finally {
        releaseSlot(this.pools, pool);
      }
      if (attempt === retries) {
        const finalErr = new UpstreamError(
          failMsg!,
          timedOut ? { timeout: true } : failStatus != null ? { status: failStatus } : { retryable: true },
        );
        if (failCause !== undefined) finalErr.cause = failCause;
        throw finalErr;
      }
      await sleepAbortable(computeBackoff(attempt), initSignal);
      if (initSignal?.aborted) {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  private readJson<T, R>(
    url: string,
    init: FetchOptions | undefined,
    maxBytes: number,
    wrap: (res: Response, body: T) => R,
  ): Promise<R> {
    return this.doFetch(
      url,
      { ...UPSTREAM_FETCH_OPTS, ...init },
      "application/json",
      async (res, signal) => wrap(res, await parseJsonBody<T>(url, res, maxBytes, signal)),
    );
  }

  async json<T>(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
    return this.readJson<T, T>(url, init, maxBytes, (_res, body) => body);
  }

  async jsonWithStatus<T>(
    url: string,
    init?: FetchOptions,
    maxBytes: number = MAX_JSON_BYTES,
  ): Promise<JsonResponse<T>> {
    return this.readJson<T, JsonResponse<T>>(url, init, maxBytes, (res, body) => ({
      status: res.status,
      body,
    }));
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    return this.doFetch(
      url,
      { ...UPSTREAM_FETCH_OPTS, ...init },
      "text/html,application/xhtml+xml,*/*",
      (res, signal) => fetchBodyText(url, res, maxBytes, signal),
    );
  }

  async probe(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const queuedAt = this.now();
    const pool = this.pool();
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = this.defaultSignal ? AbortSignal.any([this.defaultSignal, timeout]) : timeout;
    try {
      await acquireSlot(signal, this.pools, pool);
    } catch {
      return { ok: false, status: null, latencyMs: Date.now() - queuedAt, error: "aborted" };
    }
    try {
      const attemptStart = this.now();
      try {
        const res = await this.fetchImpl(url, {
          method: "HEAD",
          headers: PROBE_HEADERS,
          signal,
          cache: "no-store",
        });
        const latencyMs = this.now() - attemptStart;
        void res.body?.cancel()?.catch(() => {});
        // 405/501 means the host is alive but rejects HEAD; a fallback GET would cost another subrequest.
        if (res.status === 405 || res.status === 501) {
          return { ok: true, status: res.status, latencyMs, error: null };
        }
        return { ok: res.ok, status: res.status, latencyMs, error: res.ok ? null : `HTTP ${res.status}` };
      } catch (err) {
        const latencyMs = this.now() - attemptStart;
        if (isSubrequestLimit(err)) return { ok: false, status: null, latencyMs, error: "subrequest-limit" };
        if (this.defaultSignal?.aborted) return { ok: false, status: null, latencyMs, error: "aborted" };
        const detail = describeFetchError(err);
        return {
          ok: false,
          status: null,
          latencyMs,
          error: timeout.aborted ? `timeout: ${detail}` : `network error: ${detail}`,
        };
      }
    } finally {
      releaseSlot(this.pools, pool);
    }
  }
}
