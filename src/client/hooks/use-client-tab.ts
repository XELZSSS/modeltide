"use client";
import { useCallback, useState, useTransition } from "react";
import { useSearchParams } from "@/client/router";

export function resolveInitialTab<T extends string>(validTabs: readonly T[], raw: string | null, fallback: T): T {
  return raw != null && (validTabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/**
 * Client-only tab state.
 *
 * Tab switches intentionally do NOT rewrite the URL: every `?tab=` change
 * would re-mount the tab's SuspenseQuery reset boundary, while tab datasets
 * are already served from the React Query cache / /api. The URL param is
 * read once as the initial value so shared deep-links still land on the
 * right tab.
 */
export function useClientTab<T extends string>(
  paramKey: string,
  validTabs: readonly T[],
  fallback: T,
): [T, (tabId: string) => void, boolean] {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<T>(() => resolveInitialTab(validTabs, searchParams.get(paramKey), fallback));
  // Inside a transition React keeps the old tab on screen until the new one
  // (lazy chunk + suspense query) is ready, instead of flashing the fallback.
  const [isPending, startTransition] = useTransition();
  const setTabTransition = useCallback(
    (tabId: string) => {
      if (!(validTabs as readonly string[]).includes(tabId)) return;
      startTransition(() => {
        setTab(tabId as T);
      });
    },
    [validTabs],
  );
  return [tab, setTabTransition, isPending];
}
