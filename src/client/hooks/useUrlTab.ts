import { useCallback } from "react";
import { useSearchParams } from "react-router";

/**
 * Active tab id persisted as `?tab=` in the URL (replace navigation, so tab
 * switches are UI state, not history entries) so refreshes, back navigation and
 * deep links all restore the tab the user was actually on.
 */
export function useUrlTab<T extends string>(validTabs: readonly T[], fallback: T): [T, (tabId: string) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const paramTab = searchParams.get("tab");
  const activeTab = paramTab != null && (validTabs as readonly string[]).includes(paramTab) ? (paramTab as T) : fallback;
  const setActiveTab = useCallback(
    (tabId: string) => {
      setSearchParams(
        (prev) => {
          prev.set("tab", tabId);
          return prev;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );
  return [activeTab, setActiveTab];
}
