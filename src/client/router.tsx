"use client";
import { useCallback, useMemo, useSyncExternalStore, type ReactNode } from "react";

// Minimal dependency-free client router (replaces the next/navigation surface
// the app actually uses: Link, useRouter().push/back, usePathname,
// useSearchParams, useParams). Navigation is push-state based; every mutation
// dispatches a "routechange" event so all useSyncExternalStore subscribers
// re-render together. Deep links work because Cloudflare's static-asset layer
// serves index.html for navigation requests (not_found_handling: SPA).

const ROUTE_CHANGE = "routechange";

function emitRouteChange(): void {
  window.dispatchEvent(new Event(ROUTE_CHANGE));
}

/**
 * Router-owned position of the current entry. Written on every navigate and
 * carried through popstate by the history machinery, so BackButton can tell
 * an in-app trail (idx > 0) from a fresh landing (idx 0 / absent).
 */
function historyIndex(): number {
  const raw = (window.history.state as { idx?: unknown } | null)?.idx;
  return typeof raw === "number" && Number.isInteger(raw) && raw >= 0 ? raw : 0;
}

function navigate(to: string, replace = false): void {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  if (replace) window.history.replaceState({ idx: historyIndex() }, "", url.href);
  else window.history.pushState({ idx: historyIndex() + 1 }, "", url.href);
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

/** useRouter(): push/replace/back cover every navigation the app consumes. */
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
    () => window.location.pathname,
    () => "/",
  );
}

/** String snapshot (stable across calls) parsed into URLSearchParams on demand. */
export function useSearchParams(): URLSearchParams {
  const search = useSyncExternalStore(
    subscribe,
    () => window.location.search,
    () => "",
  );
  return useMemo(() => new URLSearchParams(search), [search]);
}

/**
 * useParams(pattern): parse dynamic segments of a path pattern such as
 * "/model/:source/*" against the current location. ":name" captures one
 * segment; "*" captures the remaining path joined by "/" under "wildcard".
 * Re-parses on every pathname change, not just on mount.
 */
function safeDecodeSegment(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    // Malformed percent-encoding: keep the raw segment so the route can
    // resolve to NotFound instead of crashing on a URIError.
    return value;
  }
}

export function useParams<T extends Record<string, string>>(pattern: string): T {
  const pathname = usePathname();
  return useMemo(() => {
    const params: Record<string, string> = {};
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = pathname.split("/").filter(Boolean);
    // Lenient by design: static segments are NOT validated here. Callers are
    // only rendered behind a pathname guard in main.tsx (startsWith), so a
    // cross-route match (e.g. /status/x against /model/:source/*) can't occur
    // in practice. Strict validation broke the "/" -> { wildcard: "" } case
    // codified in client.test.ts.
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

/**
 * Drop-in replacement for next/link: renders a real <a> (accessibility,
 * middle-click, copy-link), intercepts plain same-origin left-clicks for
 * push-state navigation, and leaves everything else (external URLs, anchors,
 * modifier keys, new tabs) to the browser.
 */
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
      if (!href || href.startsWith("#") || href.startsWith("//")) return;
      const url = new URL(href, window.location.href);
      if (url.origin !== window.location.origin) return;
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
