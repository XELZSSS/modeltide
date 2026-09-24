import { CLIENT_FETCH_TIMEOUT_MS } from "@/shared/config/time";
import { CACHE_VERSION } from "@/shared/config/cache-version.gen";
import { API_VERSION_PARAM } from "@/shared/config/paths";
import type { SourcePayload } from "@/shared/types";

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

let contractSkew = false;
const skewListeners = new Set<() => void>();

export function hasContractSkew(): boolean {
  return contractSkew;
}

export function subscribeContractSkew(listener: () => void): () => void {
  skewListeners.add(listener);
  return () => {
    skewListeners.delete(listener);
  };
}

function noteContractVersion(res: Response): void {
  const served = res.headers.get(CONTRACT_VERSION_HEADER);
  if (!served) return;
  const skewed = served !== CACHE_VERSION;
  if (skewed === contractSkew) return;
  contractSkew = skewed;
  for (const listener of skewListeners) listener();
}

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

function buildApiUrl(path: string): string {
  const url = apiBase && path.startsWith("/") ? apiBase + path : path;
  return `${url}${url.includes("?") ? "&" : "?"}${API_VERSION_PARAM}=${CACHE_VERSION}`;
}

const HAS_NATIVE_TIMEOUT = typeof AbortSignal !== "undefined" && typeof AbortSignal.timeout === "function";
const HAS_NATIVE_ANY = typeof AbortSignal !== "undefined" && typeof AbortSignal.any === "function";

interface TimeoutSignal {
  signal: AbortSignal;
  cleanup: () => void;
}

function manualWithTimeout(signal: AbortSignal | undefined, ms: number): TimeoutSignal {
  const controller = new AbortController();
  const onCallerAbort = () => controller.abort(signal?.reason);
  if (signal) {
    if (signal.aborted) controller.abort(signal.reason);
    else signal.addEventListener("abort", onCallerAbort, { once: true });
  }
  const timer = setTimeout(() => {
    controller.abort(new DOMException("The operation timed out.", "TimeoutError"));
  }, ms);
  return {
    signal: controller.signal,
    cleanup: () => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", onCallerAbort);
    },
  };
}

function withTimeout(signal: AbortSignal | undefined, ms: number): TimeoutSignal {
  if (HAS_NATIVE_TIMEOUT && (!signal || HAS_NATIVE_ANY)) {
    const timeout = AbortSignal.timeout(ms);
    return { signal: signal ? AbortSignal.any([signal, timeout]) : timeout, cleanup: () => {} };
  }
  return manualWithTimeout(signal, ms);
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
  const { signal: timeoutSignal, cleanup } = withTimeout(signal, CLIENT_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: timeoutSignal,
    });
    noteContractVersion(res);
    if (!res.ok) throw new ApiClientError(await parseErrorMessage(res), res.status);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new ApiClientError(`Expected JSON but got ${ct || "unknown content-type"}`, res.status);
    }
    return (await res.json()) as SourcePayload<T>;
  } finally {
    cleanup();
  }
}

export const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);
