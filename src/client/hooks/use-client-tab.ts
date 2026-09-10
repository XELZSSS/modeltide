"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { useSearchParams } from "@/client/router";

export function resolveInitialTab<T extends string>(validTabs: readonly T[], raw: string | null, fallback: T): T {
  return raw != null && (validTabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * Client tab state reflected in the URL via replaceState (`?tab=`).
 *
 * Replace (not push) keeps back-button history clean and never adds entries,
 * while still making tabs shareable, refresh-stable, and back/forward-aware.
 * Tab content resets through each page's `SuspenseQuery resetKey`, and data
 * comes from the React Query cache so switches stay instant.
 */
export function useClientTab<T extends string>(
  paramKey: string,
  validTabs: readonly T[],
  fallback: T,
): [T, (tabId: string) => void] {
  const searchParams = useSearchParams();
  const paramValue = searchParams.get(paramKey);
  const [tab, setTab] = useState<T>(() => resolveInitialTab(validTabs, paramValue, fallback));
  // Inside a transition React keeps the old tab on screen until the new one
  // (lazy chunk + suspense query) is ready, instead of flashing the fallback.
  const [, startTransition] = useTransition();
  // Back/forward navigation changes ?tab=: adopt it (guarded against no-ops).
  useEffect(() => {
    const next = resolveInitialTab(validTabs, paramValue, fallback);
    setTab((prev) => (prev === next ? prev : next));
  }, [paramValue, validTabs, fallback]);
  const setTabTransition = useCallback(
    (tabId: string) => {
      if (!(validTabs as readonly string[]).includes(tabId)) return;
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get(paramKey) !== tabId) {
          url.searchParams.set(paramKey, tabId);
          window.history.replaceState(null, "", url.href);
          window.dispatchEvent(new Event("routechange"));
        }
      } catch {
        // Non-browser or malformed URL: tab state still updates locally.
      }
      startTransition(() => {
        setTab(tabId as T);
      });
    },
    [paramKey, validTabs],
  );
  return [tab, setTabTransition];
}
