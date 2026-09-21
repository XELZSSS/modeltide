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

const FETCH_TIMEOUT_MS = 15_000;

export function isAbortError(err: unknown): boolean {
  return err instanceof Error && (err.name === "AbortError" || err.name === "TimeoutError");
}

const apiBase = (import.meta.env.VITE_API_BASE as string | undefined)?.replace(/\/+$/, "") ?? "";

function buildApiUrl(path: string): string {
  return apiBase && path.startsWith("/") ? apiBase + path : path;
}

function withTimeout(signal: AbortSignal | undefined, ms: number): { signal: AbortSignal; cleanup: () => void } {
  // Baseline (Workers + evergreen browsers) supports AbortSignal.timeout/any;
  // the manual addEventListener fallback was dead code — drop it.
  const timeout = AbortSignal.timeout(ms);
  if (!signal) return { signal: timeout, cleanup: () => {} };
  return { signal: AbortSignal.any([signal, timeout]), cleanup: () => {} };
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

async function apiFetch<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = buildApiUrl(path);
  const combined = withTimeout(signal, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: combined.signal,
    });
    if (!res.ok) throw new ApiClientError(await parseErrorMessage(res), res.status);
    const ct = res.headers.get("content-type") ?? "";
    if (!ct.includes("application/json")) {
      throw new ApiClientError(`Expected JSON but got ${ct || "unknown content-type"}`, res.status);
    }
    return ((await res.json()) as { data: T }).data;
  } finally {
    combined.cleanup();
  }
}

export const fetcher =
  <T>(path: string) =>
  ({ signal }: QueryCtx) =>
    apiFetch<T>(path, signal);
