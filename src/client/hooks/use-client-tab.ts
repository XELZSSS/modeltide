import { computed, type ComputedRef } from "vue";
import { navigate, usePathname, useSearchParams } from "@/client/router";

function resolveInitialTab<T extends string>(validTabs: readonly T[], raw: string | null, fallback: T): T {
  return raw != null && (validTabs as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

export function useClientTab<T extends string>(
  paramKey: string,
  validTabs: readonly T[],
  fallback: T,
): [ComputedRef<T>, (tabId: string) => void] {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = computed(() => resolveInitialTab(validTabs, searchParams.value.get(paramKey), fallback));
  function setTab(tabId: string): void {
    if (!(validTabs as readonly string[]).includes(tabId)) return;
    const next = new URLSearchParams(searchParams.value);
    if (next.get(paramKey) === tabId) return;
    next.set(paramKey, tabId);
    navigate(`${pathname.value}?${next.toString()}`, true);
  }
  return [activeTab, setTab];
}
