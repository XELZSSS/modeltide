import { computed, type ComputedRef } from "vue";
import { createRouter, createWebHistory, useRoute, type Router } from "vue-router";
import { ROUTES } from "./routes";
import type { PrefetchTarget } from "./prefetch";

export const router: Router = createRouter({
  history: createWebHistory(),
  routes: ROUTES,
  scrollBehavior: () => false,
});

let popstateNavigation = false;
// Popstate also drives genuine traversals; guard the afterEach reset so the
// flag stays true for that navigation and only flushes on programmatic ones.
let traversing = false;

window.addEventListener("popstate", () => {
  traversing = true;
  popstateNavigation = true;
});

router.afterEach(() => {
  if (traversing) {
    traversing = false;
    return;
  }
  // Programmatic navigation (router.push/replace from anywhere) must not be
  // treated as a history traversal for scroll restore, even when it bypasses
  // navigate() — previously one Back press poisoned every later forward nav.
  popstateNavigation = false;
});

export function isPopstateNavigation(): boolean {
  return popstateNavigation;
}

export function historyIndex(): number {
  const raw = (window.history.state as { position?: unknown } | null)?.position;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

export function historyFrom(): string | null {
  const raw = (window.history.state as { back?: unknown } | null)?.back;
  return typeof raw === "string" ? raw : null;
}

export function canGoBack(): boolean {
  return historyIndex() > 0;
}

export function navigate(to: string, replace = false): void {
  let url: URL;
  try {
    url = new URL(to, window.location.href);
  } catch {
    console.warn(`[router] ignoring malformed navigation target: ${to}`);
    return;
  }
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  popstateNavigation = false;
  const target = `${url.pathname}${url.search}${url.hash}`;
  const task = replace ? router.replace(target) : router.push(target);
  // Router navigation failures (e.g. aborted) shouldn't crash callers.
  if (task && typeof (task as Promise<unknown>).catch === "function") {
    (task as Promise<unknown>).catch((err: unknown) => {
      console.warn("[router] navigation failed:", err);
    });
  }
}

export function usePathname(): ComputedRef<string> {
  const route = useRoute();
  return computed(() => route.path);
}

export function routePrefetchTarget(path: string): PrefetchTarget {
  const meta = router.resolve(path).matched.at(-1)?.meta;
  return { queries: meta?.prefetch, load: meta?.load };
}

export function useSearchParams(): ComputedRef<URLSearchParams> {
  const route = useRoute();
  return computed(() => {
    const at = route.fullPath.indexOf("?");
    if (at < 0) return new URLSearchParams();
    return new URLSearchParams(route.fullPath.slice(at + 1).split("#")[0] ?? "");
  });
}
