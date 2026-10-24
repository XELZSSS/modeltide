import { CACHE_VERSION } from "@/shared/config/cache-version.gen.ts";

/**
 * Single funnel for client-side failures, so nothing is only a bare `console.error` inside a component. Every report
 * carries the build id, the current path and connectivity: without them a stack trace from a shipped bundle says
 * nothing about which screen and which build produced it. A transport can be attached here later without touching the
 * call sites.
 */
export function reportClientError(scope: string, err: unknown, detail?: Record<string, unknown>): void {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  console.error(`[client] ${scope} ${message}`, {
    build: CACHE_VERSION,
    path: window.location.pathname,
    online: navigator.onLine !== false,
    ...detail,
  });
  if (err instanceof Error && err.stack) console.error(err.stack);
}

/**
 * Catches the failures that never reach Vue's `errorHandler`: a throwing event listener, or a rejected promise with no
 * handler. Render errors are captured by ErrorBoundary instead, which reports them with the page that owns them.
 */
export function installClientErrorReporting(): void {
  window.addEventListener("error", (event) => {
    reportClientError("window.error", event.error ?? event.message);
  });
  window.addEventListener("unhandledrejection", (event) => {
    reportClientError("unhandledrejection", event.reason);
  });
}
