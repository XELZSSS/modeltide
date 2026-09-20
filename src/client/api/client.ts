export interface QueryCtx {
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
  const timeout =
    typeof AbortSignal.timeout === "function"
      ? { signal: AbortSignal.timeout(ms), cleanup: () => {} }
      : (() => {
          const ctrl = new AbortController();
          const timer = setTimeout(() => ctrl.abort(), ms);
          return { signal: ctrl.signal, cleanup: () => clearTimeout(timer) };
        })();
  if (!signal) return timeout;
  if (typeof AbortSignal.any === "function") return { signal: AbortSignal.any([signal, timeout.signal]), cleanup: timeout.cleanup };
  const ctrl = new AbortController();
  const onAbort = (): void => ctrl.abort();
  if (signal.aborted || timeout.signal.aborted) ctrl.abort();
  else {
    signal.addEventListener("abort", onAbort, { once: true });
    timeout.signal.addEventListener("abort", onAbort, { once: true });
  }
  return {
    signal: ctrl.signal,
    cleanup: () => {
      signal.removeEventListener("abort", onAbort);
      timeout.cleanup();
    },
  };
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

async function apiFetch<T>(path: string, signal?: AbortSignal, opts?: { cache?: RequestCache }): Promise<T> {
  const url = buildApiUrl(path);
  const combined = withTimeout(signal, FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { accept: "application/json" },
      signal: combined.signal,
      cache: opts?.cache,
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
