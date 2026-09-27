import { computed, type ComputedRef } from "vue";
import { navigate, useSearchParams } from "@/client/router";

function resolveInitialTab<T extends string>(validTabs: readonly T[], raw: string | null, fallback: T): T {
  return raw != null && (validTabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function useClientTab<T extends string>(
  paramKey: string,
  validTabs: readonly T[],
  fallback: T,
): [ComputedRef<T>, (tabId: string) => void] {
  const searchParams = useSearchParams();
  const activeTab = computed(() => resolveInitialTab(validTabs, searchParams.value.get(paramKey), fallback));
  function setTab(tabId: string): void {
    if (!(validTabs as readonly string[]).includes(tabId)) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get(paramKey) === tabId) return;
    url.searchParams.set(paramKey, tabId);
    navigate(url.pathname + url.search + url.hash, true);
  }
  return [activeTab, setTab];
}
