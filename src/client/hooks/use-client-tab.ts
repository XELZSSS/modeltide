"use client";
import { useCallback, useEffect, useState, useTransition } from "react";
import { replaceRoute, useSearchParams } from "@/client/router";

export function resolveInitialTab<T extends string>(validTabs: readonly T[], raw: string | null, fallback: T): T {
  return raw != null && (validTabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function useClientTab<T extends string>(
  paramKey: string,
  validTabs: readonly T[],
  fallback: T,
): [T, (tabId: string) => void] {
  const searchParams = useSearchParams();
  const paramValue = searchParams.get(paramKey);
  const [tab, setTab] = useState<T>(() => resolveInitialTab(validTabs, paramValue, fallback));
  const [, startTransition] = useTransition();
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
          replaceRoute(url.pathname + url.search + url.hash);
        }
      } catch {}
      startTransition(() => {
        setTab(tabId as T);
      });
    },
    [paramKey, validTabs],
  );
  return [tab, setTabTransition];
}
