import { BACKOFF_MAX_MS, RETRY_AFTER_MAX_MS } from "@/server/config";

const BACKOFF_BASE_MS = 500;
const BACKOFF_JITTER_MS = 250;

export function parseRetryAfterMs(res: Response): number | null {
  const raw = res.headers.get("retry-after");
  if (!raw) return null;
  const trimmed = raw.trim();
  const secs = Number(trimmed);
  if (trimmed !== "" && Number.isFinite(secs) && secs >= 0) {
    const ms = Math.min(secs, RETRY_AFTER_MAX_MS / 1000) * 1000;
    return ms > 0 ? ms : null;
  }
  const date = Date.parse(raw);
  if (Number.isFinite(date)) {
    const delay = Math.min(Math.max(date - Date.now(), 0), RETRY_AFTER_MAX_MS);
    return delay > 0 ? delay : null;
  }
  return null;
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
