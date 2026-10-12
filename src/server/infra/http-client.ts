import { MAX_JSON_BYTES, PROBE_TIMEOUT_MS, UPSTREAM_FETCH_OPTS, USER_AGENT } from "@/server/config";
import { fetchPolicy } from "@/server/config/fetch-policies";
import { upstreamUrl } from "@/server/config/upstream";
import { ClientAbortError, UpstreamError, errMsg } from "@/server/infra/errors";
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

export interface JsonPage<T> {
  data: T;
  nextUrl: string | null;
}

const NEXT_LINK_RE = /<([^>]+)>\s*;\s*rel="next"/;

export function nextLinkUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = NEXT_LINK_RE.exec(linkHeader);
  return match?.[1] ? match[1] : null;
}

function isSubrequestLimit(err: unknown): boolean {
  const msg = errMsg(err);
  return msg.includes("Too many subrequests");
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

type AttemptOutcome<T> =
  | { kind: "return"; value: T }
  | { kind: "throw"; error: unknown }
  | { kind: "abort" }
  | { kind: "fail"; message: string | null; cause: unknown; status: number | null; timedOut: boolean };

function finalError<T>(url: string, fail: Extract<AttemptOutcome<T>, { kind: "fail" }>): UpstreamError {
  const err = new UpstreamError(
    fail.message ?? `HTTP failed for ${url}`,
    fail.timedOut ? { timeout: true } : fail.status != null ? { status: fail.status } : { retryable: true },
  );
  if (fail.cause !== undefined) err.cause = fail.cause;
  return err;
}

function classifyResponse(res: Response, url: string): AttemptOutcome<never> {
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
  return { kind: "fail", message: `HTTP ${res.status} for ${url}`, cause: undefined, status: res.status, timedOut: false };
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

  private async withSlot<T>(signal: AbortSignal, run: () => Promise<T>, onAbort: () => T): Promise<T> {
    const pool = this.pool();
    try {
      await acquireSlot(signal, this.pools, pool);
    } catch {
      return onAbort();
    }
    try {
      return await run();
    } finally {
      releaseSlot(this.pools, pool);
    }
  }

  private async attemptFetch<T>(
    url: string,
    headers: Record<string, string>,
    read: (res: Response, signal: AbortSignal) => Promise<T>,
    signal: AbortSignal,
    deadline: AbortSignal,
    initSignal: AbortSignal | undefined,
    rest: Omit<FetchOptions, "timeoutMs" | "retries" | "headers" | "signal">,
  ): Promise<AttemptOutcome<T>> {
    let res: Response | null = null;
    try {
      res = await this.fetchImpl(url, { headers, signal, ...rest });
    } catch (err) {
      if (isSubrequestLimit(err)) {
        return {
          kind: "throw",
          error: new UpstreamError(`Subrequest limit hit for ${url}`, { retryable: false }),
        };
      }
      if (initSignal?.aborted) return { kind: "throw", error: new ClientAbortError(`Client aborted fetch for ${url}`) };
      const timedOut = deadline.aborted;
      return {
        kind: "fail",
        message: timedOut
          ? `Upstream timeout for ${url}: ${describeFetchError(err)}`
          : `Upstream network error for ${url}: ${describeFetchError(err)}`,
        cause: err,
        status: null,
        timedOut,
      };
    }
    if (res.ok) {
      try {
        return { kind: "return", value: await read(res, signal) };
      } catch (err) {
        if (!(err instanceof UpstreamError) || !err.retryable || signal.aborted || initSignal?.aborted) {
          return { kind: "throw", error: err };
        }
        return { kind: "fail", message: err.message, cause: undefined, status: null, timedOut: false };
      }
    }
    return classifyResponse(res, url);
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
    for (let attempt = 0; attempt <= retries; attempt++) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = initSignal ? AbortSignal.any([initSignal, deadline]) : deadline;
      const outcome = await this.withSlot(
        signal,
        () => this.attemptFetch(url, headers, read, signal, deadline, initSignal, rest),
        (): AttemptOutcome<T> => ({ kind: "abort" }),
      );
      if (outcome.kind === "return") return outcome.value;
      if (outcome.kind === "throw") throw outcome.error;
      if (outcome.kind === "abort") {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
      if (attempt === retries) throw finalError(url, outcome);
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

  async getJson<T>(url: string, policy: "interactive" | "slowFeed" = "interactive"): Promise<T> {
    return this.json<T>(url, fetchPolicy(policy));
  }

  async getJsonPage<T>(url: string, policy: "interactive" | "slowFeed" = "interactive"): Promise<JsonPage<T>> {
    return this.readJson<T, JsonPage<T>>(url, fetchPolicy(policy), MAX_JSON_BYTES, (res, body) => ({
      data: body,
      nextUrl: nextLinkUrl(res.headers.get("link")),
    }));
  }

  async getRsc(base: string, path: string, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    const policy = fetchPolicy("rsc");
    return this.text(upstreamUrl(base, path), { headers: { RSC: "1" }, ...policy }, maxBytes);
  }

  async getFeed(url: string, accept: string, maxBytes: number): Promise<string> {
    return this.text(url, { headers: { accept }, ...fetchPolicy("slowFeed") }, maxBytes);
  }

  async probe(url: string, timeoutMs: number = PROBE_TIMEOUT_MS): Promise<ProbeResult> {
    const queuedAt = this.now();
    const timeout = AbortSignal.timeout(timeoutMs);
    const signal = this.defaultSignal ? AbortSignal.any([this.defaultSignal, timeout]) : timeout;
    return this.withSlot(
      signal,
      async () => {
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
      },
      () => ({ ok: false, status: null, latencyMs: Date.now() - queuedAt, error: "aborted" }),
    );
  }
}
