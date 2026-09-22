import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { isInternalHref } from "@/shared/utils";

const ROUTE_CHANGE = "routechange";

function emitRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE));
}

interface HistoryState {
  idx?: unknown;
  /** URL the entry was pushed from, so a detail page can tell "back" from "somewhere else". */
  from?: unknown;
}

function historyState(): HistoryState | null {
  return (window.history.state as HistoryState | null) ?? null;
}

function historyIndex(): number {
  const raw = historyState()?.idx;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

/**
 * URL of the entry one step back in this session's history, or null for a landing
 * (or after a `replace`, which keeps the entry's original origin).
 */
export function historyFrom(): string | null {
  const raw = historyState()?.from;
  return typeof raw === "string" ? raw : null;
}

/** True once this session has pushed an entry, i.e. "back" has somewhere in-app to go. */
export function canGoBack(): boolean {
  return historyIndex() > 0;
}

function normalizePathname(pathname: string): string {
  if (pathname.length > 1 && pathname.endsWith("/")) return pathname.replace(/\/+$/, "") || "/";
  return pathname;
}

export function navigate(to: string, replace = false): void {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  if (replace) window.history.replaceState({ ...historyState(), idx: historyIndex() }, "", url.href);
  else {
    const current = `${window.location.pathname}${window.location.search}`;
    window.history.pushState({ idx: historyIndex() + 1, from: current }, "", url.href);
  }
  emitRouteChange();
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener("popstate", onChange);
  window.addEventListener(ROUTE_CHANGE, onChange);
  return () => {
    window.removeEventListener("popstate", onChange);
    window.removeEventListener(ROUTE_CHANGE, onChange);
  };
}

export function useRouter(): { push: (to: string) => void; replace: (to: string) => void; back: () => void } {
  return useMemo(
    () => ({
      push: (to: string) => navigate(to),
      replace: (to: string) => navigate(to, true),
      back: () => window.history.back(),
    }),
    [],
  );
}

export function usePathname(): string {
  return useSyncExternalStore(
    subscribe,
    () => normalizePathname(window.location.pathname),
    () => "/",
  );
}

export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}

function safeDecodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function useParams<T extends Record<string, string>>(pattern: string): T {
  const pathname = usePathname();
  return useMemo(() => {
    const params: Record<string, string> = {};
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = normalizePathname(pathname).split("/").filter(Boolean);
    patternParts.forEach((seg, i) => {
      if (seg.startsWith(":")) {
        const value = pathParts[i];
        if (value !== undefined) params[seg.slice(1)] = safeDecodeSegment(value);
      } else if (seg === "*") {
        params.wildcard = pathParts.slice(i).map(safeDecodeSegment).join("/");
      }
    });
    return params as T;
  }, [pattern, pathname]);
}

export function SafeLink({
  href,
  children,
  onClick,
  ...rest
}: {
  href: string;
  children: ReactNode;
  onClick?: (e: React.MouseEvent<HTMLAnchorElement>) => void;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href" | "onClick" | "children">) {
  const handleClick = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>) => {
      onClick?.(e);
      if (e.defaultPrevented) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
      const anchor = e.currentTarget as HTMLAnchorElement;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;
      if (!isInternalHref(href, window.location.origin)) return;
      e.preventDefault();
      navigate(href);
    },
    [href, onClick],
  );
  return (
    <a href={href} onClick={handleClick} {...rest}>
      {children}
    </a>
  );
}
