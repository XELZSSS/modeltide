import { apiPaths as baseApiPaths, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";

// Keep client timeout above the server's ~25s route timeout so the server's 504
// surfaces first; a shorter client abort would mask it as a generic network error.
const FETCH_TIMEOUT_MS = 60_000;

// Strip trailing slashes so apiBase can be safely concatenated with "/api/..." paths.
const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/+$/, "") ?? "";

export interface QueryCtx {
  signal?: AbortSignal;
}

/** API error carrying the HTTP status so views can branch (404 → NotFound, 5xx → retry). */
export class ApiClientError extends Error {
  readonly status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "ApiClientError";
    this.status = status;
  }
}

function timeoutSignal(ms: number): AbortSignal {
  // AbortSignal.timeout is missing on older Safari; fall back to AbortController.
  if (typeof AbortSignal.timeout === "function") return AbortSignal.timeout(ms);
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), ms);
  return ctrl.signal;
}

function combineSignals(a: AbortSignal, b: AbortSignal): AbortSignal {
  if (typeof AbortSignal.any === "function") return AbortSignal.any([a, b]);
  // Fallback: abort as soon as either source aborts.
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  if (a.aborted || b.aborted) ctrl.abort();
  else {
    a.addEventListener("abort", onAbort, { once: true });
    b.addEventListener("abort", onAbort, { once: true });
  }
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

/** GET `path` (apiBase-prefixed when relative) and unwrap the server's `{ data }` envelope. */
async function apiFetch<T>(path: string, signal?: AbortSignal, opts?: { cache?: RequestCache }): Promise<T> {
  const url = apiBase && path.startsWith("/") ? apiBase + path : path;
  const timeout = timeoutSignal(FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: signal ? combineSignals(signal, timeout) : timeout,
    cache: opts?.cache,
  });
  if (!res.ok) throw new ApiClientError(await parseErrorMessage(res), res.status);
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new ApiClientError(`Expected JSON but got ${ct || "unknown content-type"}`, res.status);
  }
  return ((await res.json()) as { data: T }).data;
}

// Client-facing path builders; the base paths come from the shared apiPaths map.
// NOTE: pointing VITE_API_BASE at another origin also requires adding that origin
// to connect-src in public/_headers (the CSP restricts fetches to 'self').
export const apiPaths = {
  artificialIndex: baseApiPaths.artificialIndex,
  // The open-source list is paginated server-side; the query string derives from
  // the shared OPEN_SOURCE_MODELS_DEFAULTS, the same constants the query key uses.
  openSourceModels: (() => {
    const d = OPEN_SOURCE_MODELS_DEFAULTS;
    return `${baseApiPaths.openSourceModels}?sort=${d.sort}&direction=${d.direction}&limit=${d.limit}`;
  })(),
  openSourceReleases: baseApiPaths.openSourceReleases,
  openRouterRankings: baseApiPaths.openRouterRankings,
  closedReleases: baseApiPaths.closedReleases,
  arenaBoard: (category: string) => `${baseApiPaths.arenaBoard}?category=${encodeURIComponent(category)}`,
  arenaRankings: baseApiPaths.arenaRankings,
  officialPricing: baseApiPaths.officialPricing,
  statusHistory: baseApiPaths.statusHistory,
  news: (category: string) => `${baseApiPaths.news}?category=${encodeURIComponent(category)}`,
  homeDashboard: baseApiPaths.homeDashboard,
} as const;

export const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);
