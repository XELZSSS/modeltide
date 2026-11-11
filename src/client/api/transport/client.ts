import type { QueryClient } from "@tanstack/query-core";
import { ref } from "vue";
import { LruCache } from "@/client/utils/lru";
import { CACHE_VERSION, CONTRACT_VERSION } from "@/shared/config/cache-version.gen.ts";
import { API_VERSION_PARAM, type ApiDomain } from "@/shared/config/api";
import type { SourcePayload } from "@/shared/types";
import type { ApiErrorBody, ApiErrorKind } from "@/shared/types/api-error";
import { defaultApiErrorKind } from "@/shared/types/api-error";
import { ApiClientError, malformedPayload } from "./error";

export { ApiClientError, isAbortError, malformedPayload } from "./error";
export type { ClientErrorKind } from "./error";

const CLIENT_FETCH_TIMEOUT_MS = 35_000;
const CONTRACT_VERSION_HEADER = "x-contract-version";
const NOT_MODIFIED = 304;
const MAX_RESPONSE_TEXT_SHOWN = 500;

/** Last `ETag` per request URL: a matching `If-None-Match` gets a bodiless 304, so an unchanged refetch costs no
 * transfer and no parse. Bounded because per-model detail queries mint a key per id. */
const ETAG_STORE_MAX = 96;
const etagByUrl = new LruCache<string, string>(ETAG_STORE_MAX);

function rememberEtag(url: string, etag: string | null): void {
  if (etag === null) return;
  etagByUrl.set(url, etag);
}

interface QueryCtx {
  signal?: AbortSignal;
  client: QueryClient;
  queryKey: readonly unknown[];
}

export const contractSkew = ref(false);

/** Our own function sends this header on success and error alike, so an absent header means an unverifiable response
 * (service-worker copy, middlebox) and reads as "no information" rather than a pinned mismatch.
 * Compared against CONTRACT_VERSION, not the cache version: only the payload shape decides whether this bundle can read it. */
function noteContractVersion(res: Response): void {
  const served = res.headers.get(CONTRACT_VERSION_HEADER);
  contractSkew.value = served !== null && served !== CONTRACT_VERSION;
}

/** Same-origin only: the API ships no CORS headers.
 * `?v=` carries the cache version rather than the contract version: values can change without the shape changing, and
 * that still has to miss every browser and edge copy of the previous build. */
function buildApiUrl(path: string): string {
  const [base, query] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(API_VERSION_PARAM, CACHE_VERSION);
  return `${base}?${params.toString()}`;
}

interface MergedSignal {
  signal: AbortSignal;
  /** Detaches both listeners. A completed request must call it, or the query's signal keeps the closures alive. */
  dispose: () => void;
}

const NO_DISPOSE = (): void => {};

/** The caller's abort signal joined with a timeout.
 * `AbortSignal.timeout` is inside the `baseline-widely-available` set Vite builds for (Chrome 111 / Safari 16.4 floor), so
 * it is used directly; `AbortSignal.any` is not (Chrome 116 / Safari 17.4), so the merge is hand-written. */
function withTimeout(signal: AbortSignal | undefined, ms: number): MergedSignal {
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return { signal: timeout, dispose: NO_DISPOSE };
  if (signal.aborted) return { signal, dispose: NO_DISPOSE };
  if (timeout.aborted) return { signal: timeout, dispose: NO_DISPOSE };
  const ctrl = new AbortController();
  const onSignalAbort = (): void => {
    ctrl.abort(signal.reason);
  };
  const onTimeoutAbort = (): void => {
    ctrl.abort(timeout.reason);
  };
  signal.addEventListener("abort", onSignalAbort, { once: true });
  timeout.addEventListener("abort", onTimeoutAbort, { once: true });
  return {
    signal: ctrl.signal,
    dispose: () => {
      signal.removeEventListener("abort", onSignalAbort);
      timeout.removeEventListener("abort", onTimeoutAbort);
    },
  };
}

interface ParsedError {
  message: string;
  kind: ApiErrorKind;
  source?: ApiDomain;
  upstreamStatus?: number;
}

/** Our own failures carry `{ error: { kind, message, source, upstreamStatus } }`; anything else on this path (a middlebox,
 * a service-worker copy, an older edge build) only gets its status right, so the kind is derived from it. */
async function parseErrorResponse(res: Response): Promise<ParsedError> {
  const kind = defaultApiErrorKind(res.status);
  const ct = res.headers.get("content-type") ?? "";
  try {
    if (ct.includes("application/json")) {
      const body = (await res.json()) as ApiErrorBody | null;
      const error = body?.error;
      if (error !== undefined) {
        return {
          message: error.message,
          kind: error.kind ?? kind,
          source: error.source,
          upstreamStatus: error.upstreamStatus,
        };
      }
    } else {
      const text = await res.text();
      if (text) return { message: text.slice(0, MAX_RESPONSE_TEXT_SHOWN), kind };
    }
  } catch (e) {
    console.warn("[api] failed to parse error response:", e);
  }
  return { message: `HTTP ${res.status}: ${res.statusText}`, kind };
}

/** `Retry-After` in whole seconds, when the edge sent one the reader could act on. */
function retryAfterSeconds(header: string | null): number | undefined {
  const seconds = Number(header);
  return header !== null && Number.isFinite(seconds) && seconds > 0 ? seconds : undefined;
}

/** `previous` is the payload the query cache already holds for this key, which is what makes `If-None-Match` answerable:
 * a matching tag gets a bodiless 304, so a revalidation that changed nothing costs no transfer, no parse and no re-render. */
async function apiFetch<T>(
  path: string,
  signal: AbortSignal | undefined,
  previous: SourcePayload<T> | undefined,
): Promise<SourcePayload<T>> {
  const url = buildApiUrl(path);
  const etag = previous === undefined ? undefined : etagByUrl.get(url);
  const headers: Record<string, string> = { accept: "application/json" };
  if (etag !== undefined) headers["if-none-match"] = etag;
  const merged = withTimeout(signal, CLIENT_FETCH_TIMEOUT_MS);
  // The listeners stay attached until the body has been read — the timeout has to bound a response whose body never finishes.
  try {
    let res: Response;
    try {
      res = await fetch(url, { headers, signal: merged.signal });
    } catch (err) {
      // `fetch` rejects with a `TypeError` when the request never reached the server (DNS, TLS, a reset connection); a
      // cancellation keeps its DOMException name, which `classifyError` reads as timeout or abort.
      if (err instanceof TypeError) throw new ApiClientError(err.message, "network");
      throw err;
    }
    noteContractVersion(res);
    // Only sent when `previous` exists, so this branch always has a body; the status is a success signal here, not a failure.
    if (res.status === NOT_MODIFIED && previous !== undefined) return previous;
    if (!res.ok) {
      const failure = await parseErrorResponse(res);
      throw new ApiClientError(failure.message, failure.kind, {
        status: res.status,
        source: failure.source,
        upstreamStatus: failure.upstreamStatus,
        retryAfterS: retryAfterSeconds(res.headers.get("retry-after")),
      });
    }
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw malformedPayload(`Expected JSON but got ${ct || "unknown content-type"}`);
    }
    const body = await res.json();
    if (body == null || typeof body !== "object" || !("data" in body)) {
      throw malformedPayload("Malformed payload: missing data field");
    }
    rememberEtag(url, res.headers.get("etag"));
    return body as SourcePayload<T>;
  } finally {
    merged.dispose();
  }
}

export const fetcher =
  <T>(path: string) =>
  ({ signal, client, queryKey }: QueryCtx) =>
    apiFetch<T>(path, signal, client.getQueryData<SourcePayload<T>>(queryKey));
