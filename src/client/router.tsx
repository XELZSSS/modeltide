import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { isInternalHref } from "@/client/utils/url";

const ROUTE_CHANGE = "routechange";

function emitRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE));
}

interface HistoryState {
  idx?: unknown;
  from?: unknown;
}

function historyState(): HistoryState | null {
  return (window.history.state as HistoryState | null) ?? null;
}

export function historyIndex(): number {
  const raw = historyState()?.idx;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

export function historyFrom(): string | null {
  const raw = historyState()?.from;
  return typeof raw === "string" ? raw : null;
}

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

let popstateNavigation = false;

function subscribe(onChange: () => void): () => void {
  const onPopstate = () => {
    popstateNavigation = true;
    onChange();
  };
  const onRouteChange = () => {
    popstateNavigation = false;
    onChange();
  };
  window.addEventListener("popstate", onPopstate);
  window.addEventListener(ROUTE_CHANGE, onRouteChange);
  return () => {
    window.removeEventListener("popstate", onPopstate);
    window.removeEventListener(ROUTE_CHANGE, onRouteChange);
  };
}

/** True when the last route change came from browser back/forward rather than `navigate`; the
 *  pathname alone cannot tell the two apart. */
export function isPopstateNavigation(): boolean {
  return popstateNavigation;
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
