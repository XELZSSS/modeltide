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

function navigate(to: string, replace = false): void {
  const url = new URL(to, window.location.href);
  if (url.origin !== window.location.origin) {
    window.location.assign(url.href);
    return;
  }
  if (replace) window.history.replaceState(null, "", url.href);
  else window.history.pushState(null, "", url.href);
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

/** useRouter(): push/back are the only navigation APIs the app consumes. */
export function useRouter(): { push: (to: string) => void; back: () => void } {
  return useMemo(
    () => ({
      push: (to: string) => navigate(to),
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
 */
export function useParams<T extends Record<string, string>>(pattern: string): T {
  return useMemo(() => {
    const params: Record<string, string> = {};
    const patternParts = pattern.split("/").filter(Boolean);
    const pathParts = window.location.pathname.split("/").filter(Boolean);
    patternParts.forEach((seg, i) => {
      if (seg.startsWith(":")) {
        const value = pathParts[i];
        if (value !== undefined) params[seg.slice(1)] = decodeURIComponent(value);
      } else if (seg === "*") {
        params.wildcard = pathParts
          .slice(i)
          .map((p) => decodeURIComponent(p))
          .join("/");
      }
    });
    return params as T;
  }, [pattern]);
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
