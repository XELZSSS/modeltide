import { computed, type ComputedRef } from "vue";
import { createRouter, createWebHistory, useRoute, type Router } from "vue-router";
import { ROUTES } from "@/client/config/routes";

export const router: Router = createRouter({
  history: createWebHistory(),
  routes: ROUTES,
  scrollBehavior: () => false,
});

let popstateNavigation = false;

window.addEventListener("popstate", () => {
  popstateNavigation = true;
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
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  popstateNavigation = false;
  const target = `${url.pathname}${url.search}${url.hash}`;
  void (replace ? router.replace(target) : router.push(target));
}

export function usePathname(): ComputedRef<string> {
  const route = useRoute();
  return computed(() => route.path);
}

export function useSearchParams(): ComputedRef<URLSearchParams> {
  const route = useRoute();
  return computed(() => {
    const at = route.fullPath.indexOf("?");
    if (at < 0) return new URLSearchParams();
    return new URLSearchParams(route.fullPath.slice(at + 1).split("#")[0] ?? "");
  });
}
