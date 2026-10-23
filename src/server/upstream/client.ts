import { MAX_JSON_BYTES, USER_AGENT, upstreamUrl } from "./upstream";
import { FEED_FETCH_OPTS, UPSTREAM_FETCH_OPTS } from "./timeouts";
import { ClientAbortError, UpstreamError, errMsg } from "@/server/api/errors";
import { acquireSlot, createSlotPool, releaseSlot, type SlotPool } from "./pools";
import { fetchBodyText, parseJsonBody } from "./body-readers";
import { parseRetryAfterMs, computeBackoff, sleepAbortable } from "./retry";

type FetchPolicyName = "interactive" | "slowFeed";

// Interactive calls may retry once; feed reads get their own single retry with a shorter per-attempt budget.
const FETCH_POLICIES = {
  interactive: UPSTREAM_FETCH_OPTS,
  slowFeed: FEED_FETCH_OPTS,
} as const;

function fetchPolicy(name: FetchPolicyName): { timeoutMs: number; retries: number } {
  return { ...FETCH_POLICIES[name] };
}

type FetchOptions = Omit<RequestInit, "headers"> & {
  timeoutMs?: number;
  retries?: number;
  headers?: Record<string, string>;
};

function buildHeaders(userAgent: string, accept: string, extra?: Record<string, string>): Record<string, string> {
  return { "user-agent": userAgent, accept, ...extra };
}

interface JsonPage<T> {
  data: T;
  nextUrl: string | null;
}
const NEXT_LINK_RE = /<([^>]+)>\s*;\s*rel="next"/;

function nextLinkUrl(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = NEXT_LINK_RE.exec(linkHeader);
  return match?.[1] ? match[1] : null;
}

function isSubrequestLimit(err: unknown): boolean {
  const msg = errMsg(err);
  return msg.includes("Too many subrequests");
}

// fetch() rejections carry DNS/TCP/TLS detail on `message`/`cause`; truncate so logs stay readable.
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

/**
 * Both a client hang-up and a watchdog deadline abort the same signal. Only the former is a client
 * disconnect: the shared refresh context hands this client an `AbortSignal.timeout()`, and reporting
 * that as a client abort would surface a non-retryable 499 for a merely slow upstream.
 */
function abortedByDeadline(signal: AbortSignal): boolean {
  // Only a `TimeoutError` reason means the watchdog fired. A caller hang-up carries `AbortError`,
  // and the shared error helper treats both as timeout-like, so match the name precisely here.
  const reason = signal.reason as { name?: unknown } | undefined;
  return reason?.name === "TimeoutError";
}

function abortFailure(url: string, signal: AbortSignal): Error {
  return abortedByDeadline(signal)
    ? new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true })
    : new ClientAbortError(`Client aborted fetch for ${url}`);
}

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
  return {
    kind: "fail",
    message: `HTTP ${res.status} for ${url}`,
    cause: undefined,
    status: res.status,
    timedOut: false,
  };
}

export class HttpClient {
  private defaultSignal?: AbortSignal;
  readonly pools: SlotPool;
  constructor(opts?: { signal?: AbortSignal; pools?: SlotPool }) {
    this.defaultSignal = opts?.signal;
    this.pools = opts?.pools ?? createSlotPool();
  }

  private async withSlot<T>(signal: AbortSignal, run: () => Promise<T>, onAbort: () => T): Promise<T> {
    try {
      await acquireSlot(signal, this.pools);
    } catch {
      return onAbort();
    }
    try {
      return await run();
    } finally {
      releaseSlot(this.pools);
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
      // Resolve `fetch` per call: never capture the Pages Functions global ahead of time.
      res = await fetch(url, { headers, signal, ...rest });
    } catch (err) {
      if (isSubrequestLimit(err)) {
        return {
          kind: "throw",
          error: new UpstreamError(`Subrequest limit hit for ${url}`, { retryable: false }),
        };
      }
      if (initSignal?.aborted) return { kind: "throw", error: abortFailure(url, initSignal) };
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
        if (initSignal?.aborted) {
          return { kind: "throw", error: abortFailure(url, initSignal) };
        }
        // A body read killed by this attempt's deadline is a timeout like the fetch stage; spend retries too.
        if (err instanceof UpstreamError && err.causedByTimeout && deadline.aborted) {
          return { kind: "fail", message: err.message, cause: undefined, status: null, timedOut: true };
        }
        if (!(err instanceof UpstreamError) || !err.retryable || signal.aborted) {
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
        // Slot-race loss is either the caller hanging up or this attempt's own deadline.
        (): AttemptOutcome<T> =>
          initSignal?.aborted ? { kind: "throw", error: abortFailure(url, initSignal) } : { kind: "abort" },
      );
      if (outcome.kind === "return") return outcome.value;
      if (outcome.kind === "throw") throw outcome.error;
      if (outcome.kind === "abort") {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
      if (attempt === retries) throw finalError(url, outcome);
      await sleepAbortable(computeBackoff(attempt), initSignal);
      if (initSignal?.aborted) throw abortFailure(url, initSignal);
    }
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  private readJson<T, R>(
    url: string,
    init: FetchOptions | undefined,
    maxBytes: number,
    wrap: (res: Response, body: T) => R,
  ): Promise<R> {
    return this.doFetch(url, { ...UPSTREAM_FETCH_OPTS, ...init }, "application/json", async (res, signal) =>
      wrap(res, await parseJsonBody<T>(url, res, maxBytes, signal)),
    );
  }

  async json<T>(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
    return this.readJson<T, T>(url, init, maxBytes, (_res, body) => body);
  }

  async text(url: string, init?: FetchOptions, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    return this.doFetch(
      url,
      { ...UPSTREAM_FETCH_OPTS, ...init },
      "text/html,application/xhtml+xml,*/*",
      (res, signal) => fetchBodyText(url, res, maxBytes, signal),
    );
  }

  async getJson<T>(url: string): Promise<T> {
    return this.json<T>(url, fetchPolicy("interactive"));
  }

  /**
   * `opts` overrides the interactive policy per page: the first page of a listing is worth a retry, later pages
   * already have usable rows in hand and should fail fast into a partial response instead of stalling the refresh.
   */
  async getJsonPage<T>(url: string, opts?: { timeoutMs?: number; retries?: number }): Promise<JsonPage<T>> {
    return this.readJson<T, JsonPage<T>>(
      url,
      { ...fetchPolicy("interactive"), ...opts },
      MAX_JSON_BYTES,
      (res, body) => ({
        data: body,
        nextUrl: nextLinkUrl(res.headers.get("link")),
      }),
    );
  }

  async getRsc(base: string, path: string): Promise<string> {
    const policy = fetchPolicy("interactive");
    return this.text(upstreamUrl(base, path), { headers: { RSC: "1" }, ...policy }, MAX_JSON_BYTES);
  }

  async getFeed(url: string, accept: string, maxBytes: number): Promise<string> {
    return this.text(url, { headers: { accept }, ...fetchPolicy("slowFeed") }, maxBytes);
  }
}
