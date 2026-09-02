import { apiPaths as baseApiPaths, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config";

// Keep client timeout in sync with the server's 60s route timeout; a shorter
// client abort would surface an error while the server request still succeeds.
const FETCH_TIMEOUT_MS = 60_000;

// Strip trailing slashes so apiBase can be safely concatenated with "/api/..." paths.
const apiBase = import.meta.env?.VITE_API_BASE?.replace(/\/+$/, "") ?? "";

export interface QueryCtx {
  signal?: AbortSignal;
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
export async function apiFetch<T>(path: string, signal?: AbortSignal, opts?: { cache?: RequestCache }): Promise<T> {
  const url = apiBase && path.startsWith("/") ? apiBase + path : path;
  const timeout = AbortSignal.timeout(FETCH_TIMEOUT_MS);
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    cache: opts?.cache,
  });
  if (!res.ok) throw new Error(await parseErrorMessage(res));
  const ct = res.headers.get("content-type") ?? "";
  if (!ct.includes("application/json")) {
    throw new Error(`Expected JSON but got ${ct || "unknown content-type"}`);
  }
  return ((await res.json()) as { data: T }).data;
}

// Client-facing path builders; the base paths come from the shared apiPaths map.
// NOTE: pointing VITE_API_BASE at another origin also requires adding that origin
// to connect-src in public/_headers (the CSP restricts fetches to 'self').
export const apiPaths = {
  artificialIndex: baseApiPaths.artificialIndex,
  // The open-source list is paginated server-side; defaults come from the shared
  // OPEN_SOURCE_MODELS_DEFAULTS so the query key and the URL never disagree.
  openSourceModels: (
    sort = OPEN_SOURCE_MODELS_DEFAULTS.sort,
    direction = OPEN_SOURCE_MODELS_DEFAULTS.direction,
    limit = OPEN_SOURCE_MODELS_DEFAULTS.limit,
  ) => `${baseApiPaths.openSourceModels}?sort=${sort}&direction=${direction}&limit=${limit}`,
  openSourceReleases: baseApiPaths.openSourceReleases,
  openRouterRankings: baseApiPaths.openRouterRankings,
  statusHistory: baseApiPaths.statusHistory,
  news: (category: string) => `${baseApiPaths.news}?category=${encodeURIComponent(category)}`,
  homeDashboard: baseApiPaths.homeDashboard,
} as const;

export const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);
