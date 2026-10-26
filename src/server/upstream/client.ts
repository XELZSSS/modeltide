import { MAX_JSON_BYTES, MAX_RSC_BYTES, USER_AGENT, upstreamUrl } from "./upstream";
import { FEED_FETCH_OPTS, NETWORK_RETRY_BACKOFF_MS, UPSTREAM_FETCH_OPTS } from "./timeouts";
import { ClientAbortError, UpstreamError, errMsg } from "@/server/api/errors";
import type { Logger } from "@/server/api/logger";
import { acquireSlot, createSlotPool, releaseSlot, type SlotPool } from "./pools";
import { fetchBodyText, parseJsonBody } from "./body-readers";
import { parseRetryAfterMs, computeBackoff, sleepAbortable } from "./retry";

/** The two numbers a policy is made of: `doFetch` needs both, and each entry point passes the pair it wants. */
interface FetchPolicy {
  timeoutMs: number;
  retries: number;
}

type FetchOptions = Omit<RequestInit, "headers"> &
  FetchPolicy & {
    headers?: Record<string, string>;
  };

/** What a caller may pass: the same shape, but either policy number can be left to the default or overridden. */
type FetchOptionsInput = Omit<FetchOptions, keyof FetchPolicy> & Partial<FetchPolicy>;

function buildHeaders(userAgent: string, accept: string, extra?: Record<string, string>): Record<string, string> {
  return { "user-agent": userAgent, accept, ...extra };
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

/** The socket-level reason only: `ENOTFOUND` and `UND_ERR_CONNECT_TIMEOUT` are what tell a DNS blip from a dead origin. */
function failureCode(cause: unknown): string {
  const code = (cause as { code?: unknown } | null | undefined)?.code;
  if (typeof code === "string" && code !== "") return code;
  return errMsg(cause ?? "unknown").slice(0, 80);
}

/** `host + path`, dropping the query: the identifiers in it are long and never the point of the line. */
function shortTarget(url: string): string {
  const parsed = new URL(url);
  const target = `${parsed.host}${parsed.pathname}`;
  return target.length > 64 ? `${target.slice(0, 61)}...` : target;
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

/**
 * What one attempt can report about itself: time to the response *headers* (DNS + connect + TLS + first byte), the size
 * when the upstream declared one, and the status. The body is read after `ttfbMs`, so `total - ttfb` is the body time.
 */
interface AttemptTiming {
  ttfbMs: number | null;
  bytes: number | null;
  status: number | null;
}

interface AttemptInput<T> {
  url: string;
  headers: Record<string, string>;
  read: (res: Response, signal: AbortSignal) => Promise<T>;
  signal: AbortSignal;
  deadline: AbortSignal;
  initSignal: AbortSignal | undefined;
  rest: Omit<FetchOptions, "timeoutMs" | "retries" | "headers" | "signal">;
}

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
  /** Optional on purpose: the test suite builds a client without one and stays quiet. `buildContext` passes the logger. */
  private log?: Logger;
  constructor(opts?: { signal?: AbortSignal; pools?: SlotPool; log?: Logger }) {
    this.defaultSignal = opts?.signal;
    this.pools = opts?.pools ?? createSlotPool();
    this.log = opts?.log;
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

  private async attemptFetch<T>(input: AttemptInput<T>, timing: AttemptTiming): Promise<AttemptOutcome<T>> {
    const { url, headers, read, signal, deadline, initSignal, rest } = input;
    const startedAt = Date.now();
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
    timing.ttfbMs = Date.now() - startedAt;
    timing.status = res.status;
    const declared = Number(res.headers.get("content-length"));
    timing.bytes = Number.isFinite(declared) && declared > 0 ? declared : null;
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
    const initSignal = initSignalOpt ?? this.defaultSignal;
    const headers = buildHeaders(USER_AGENT, accept, initHeaders);
    for (let attempt = 0; attempt <= retries; attempt++) {
      const deadline = AbortSignal.timeout(timeoutMs);
      const signal = initSignal ? AbortSignal.any([initSignal, deadline]) : deadline;
      const timing: AttemptTiming = { ttfbMs: null, bytes: null, status: null };
      const startedAt = Date.now();
      const outcome = await this.withSlot(
        signal,
        () => this.attemptFetch({ url, headers, read, signal, deadline, initSignal, rest }, timing),
        // Slot-race loss is either the caller hanging up or this attempt's own deadline.
        (): AttemptOutcome<T> =>
          initSignal?.aborted ? { kind: "throw", error: abortFailure(url, initSignal) } : { kind: "abort" },
      );
      this.logAttempt(url, { attempt, retries, startedAt, timing, outcome });
      if (outcome.kind === "return") return outcome.value;
      if (outcome.kind === "throw") throw outcome.error;
      if (outcome.kind === "abort") {
        throw new UpstreamError(`Upstream deadline exceeded for ${url}`, { timeout: true });
      }
      if (attempt === retries) throw finalError(url, outcome);
      // A failure that never reached the upstream — DNS, refused, reset — spends none of this attempt's timeout, and the
      // 500 ms an attempt-0 backoff waits lands inside the very blip that caused it. `NETWORK_RETRY_BACKOFF_MS` waits
      // past that blip while staying inside the budget `timeouts.ts` documents for this call.
      const networkFailure = outcome.status === null && !outcome.timedOut;
      await sleepAbortable(networkFailure ? NETWORK_RETRY_BACKOFF_MS : computeBackoff(attempt), initSignal);
      if (initSignal?.aborted) throw abortFailure(url, initSignal);
    }
    // Not reachable from the loop above — every `attempt` either returns, throws, or is the last one — but the loop is
    // the function's only exit, so TypeScript needs a terminator for `Promise<T>`. Kept as a throw rather than a bare
    // `return` so a future edit that does fall through fails loudly instead of resolving `undefined` as a payload.
    throw new UpstreamError(`HTTP failed for ${url}`);
  }

  /**
   * One line per upstream attempt, and every data source the API reads goes through this client (Artificial Analysis'
   * RSC pages and JSON, OpenRouter's directory and rankings, Hugging Face, the news feeds). The leg-level warnings that
   * already exist cannot tell a stalled local network from a slow origin — both read "fetch failed" — so this is the line
   * that separates them: `ttfb` covers DNS + connect + TLS + first byte, `total - ttfb` is the body.
   */
  private logAttempt<T>(
    url: string,
    attempt: {
      attempt: number;
      retries: number;
      startedAt: number;
      timing: AttemptTiming;
      outcome: AttemptOutcome<T>;
    },
  ): void {
    if (!this.log) return;
    const { timing, outcome } = attempt;
    const parts = [
      `status=${timing.status ?? "-"}`,
      `ttfb=${timing.ttfbMs == null ? "-" : `${timing.ttfbMs}ms`}`,
      `total=${Date.now() - attempt.startedAt}ms`,
      `attempt=${attempt.attempt + 1}/${attempt.retries + 1}`,
    ];
    if (timing.bytes != null) parts.push(`bytes=${timing.bytes}`);
    if (outcome.kind === "fail") parts.push(`cause=${outcome.timedOut ? "timeout" : failureCode(outcome.cause)}`);
    if (outcome.kind === "throw") parts.push(`cause=${failureCode(outcome.error)}`);
    if (outcome.kind === "abort") parts.push("cause=aborted");
    this.log("info", `[upstream] ${shortTarget(url)} ${parts.join(" ")}`);
  }

  async json<T>(url: string, init?: FetchOptionsInput, maxBytes: number = MAX_JSON_BYTES): Promise<T> {
    return this.doFetch(url, { ...UPSTREAM_FETCH_OPTS, ...init }, "application/json", (res, signal) =>
      parseJsonBody<T>(url, res, maxBytes, signal),
    );
  }

  async text(url: string, init?: FetchOptionsInput, maxBytes: number = MAX_JSON_BYTES): Promise<string> {
    return this.doFetch(
      url,
      { ...UPSTREAM_FETCH_OPTS, ...init },
      "text/html,application/xhtml+xml,*/*",
      (res, signal) => fetchBodyText(url, res, maxBytes, signal),
    );
  }
  async getRsc(base: string, path: string): Promise<string> {
    return this.text(upstreamUrl(base, path), { headers: { RSC: "1" } }, MAX_RSC_BYTES);
  }

  async getFeed(url: string, accept: string, maxBytes: number): Promise<string> {
    return this.text(url, { headers: { accept }, ...FEED_FETCH_OPTS }, maxBytes);
  }
}
