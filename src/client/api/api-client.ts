import { ref } from "vue";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen.ts";
import { API_VERSION_PARAM } from "@/shared/config/api";
import type { SourcePayload } from "@/shared/types";

const CLIENT_FETCH_TIMEOUT_MS = 35_000;
const CONTRACT_VERSION_HEADER = "x-contract-version";

interface QueryCtx {
  signal?: AbortSignal;
}

export class ApiClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

export function isAbortError(err: unknown): boolean {
  const name = (err as { name?: unknown } | null | undefined)?.name;
  return name === "AbortError" || name === "TimeoutError";
}

export const contractSkew = ref(false);

/**
 * Every response from our own function carries the header, on success and on error paths alike, so an absent
 * header means the response came from something we cannot verify (service worker copy, middlebox). Treat that as
 * "no information" instead of pinning a previous mismatch, which used to leave the notice up indefinitely.
 */
function noteContractVersion(res: Response): void {
  const served = res.headers.get(CONTRACT_VERSION_HEADER);
  contractSkew.value = served !== null && served !== CACHE_VERSION;
}

/** Same-origin only: the API ships no CORS headers, so every call goes back to this origin. */
function buildApiUrl(path: string): string {
  const [base, query] = path.split("?", 2);
  const params = new URLSearchParams(query);
  params.set(API_VERSION_PARAM, CACHE_VERSION);
  return `${base}?${params.toString()}`;
}

function timeoutSignal(ms: number): AbortSignal {
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(new DOMException("Timed out", "TimeoutError")), ms);
  ctrl.signal.addEventListener("abort", () => clearTimeout(timer), { once: true });
  return ctrl.signal;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): AbortSignal {
  const timeout = timeoutSignal(ms);
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return AbortSignal.any([signal, timeout]);
  if (signal.aborted) return signal;
  if (timeout.aborted) return timeout;
  const ctrl = new AbortController();
  const onSignalAbort = (): void => {
    timeout.removeEventListener("abort", onTimeoutAbort);
    ctrl.abort(signal.reason);
  };
  const onTimeoutAbort = (): void => {
    signal.removeEventListener("abort", onSignalAbort);
    ctrl.abort(timeout.reason);
  };
  signal.addEventListener("abort", onSignalAbort, { once: true });
  timeout.addEventListener("abort", onTimeoutAbort, { once: true });
  return ctrl.signal;
}

async function parseErrorMessage(res: Response): Promise<string> {
  const ct = res.headers.get("content-type") ?? "";
  let message = `HTTP ${res.status}: ${res.statusText}`;
  try {
    if (ct.includes("application/json")) {
      const body = (await res.json()) as { error?: { message?: string } } | null;
      if (body?.error?.message) message = body.error.message;
    } else {
      const text = await res.text();
      if (text) message = text.slice(0, 500);
    }
  } catch (e) {
    console.warn("[api] failed to parse error response:", e);
  }
  return message;
}

async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<SourcePayload<T>> {
  const url = buildApiUrl(path);
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: withTimeout(signal, CLIENT_FETCH_TIMEOUT_MS),
  });
  noteContractVersion(res);
  if (!res.ok) throw new ApiClientError(await parseErrorMessage(res), res.status);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new ApiClientError(`Expected JSON but got ${ct || "unknown content-type"}`, res.status);
  }
  const body = await res.json();
  if (body == null || typeof body !== "object" || !("data" in body)) {
    throw new ApiClientError("Malformed payload: missing data field", res.status);
  }
  return body as SourcePayload<T>;
}

export const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);
