import { BACKOFF_MAX_MS, RETRY_AFTER_MAX_MS } from "./timeouts";

const BACKOFF_BASE_MS = 500;
const BACKOFF_JITTER_MS = 250;

export function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (raw === null) return null;
  // Delta-seconds first, then the HTTP-date form. Both answer null for a value that has already passed: waiting for
  // it would only be another failed attempt.
  const deltaMs = Math.min(Number(raw.trim()), RETRY_AFTER_MAX_MS / 1000) * 1000;
  if (deltaMs > 0) return deltaMs;
  const dateMs = Math.min(Date.parse(raw) - Date.now(), RETRY_AFTER_MAX_MS);
  return dateMs > 0 ? dateMs : null;
}

export function computeBackoff(attempt: number): number {
  return Math.min(BACKOFF_BASE_MS * 2 ** attempt + Math.random() * BACKOFF_JITTER_MS, BACKOFF_MAX_MS);
}

export function sleepAbortable(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal?.aborted) {
      resolve();
      return;
    }
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = (): void => {
      clearTimeout(t);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
