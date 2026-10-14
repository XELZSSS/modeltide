import { defineStore } from "pinia";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/shared/utils/models";
import { loadPersistedState, makeStorageSync } from "@/client/stores/make-persisted-store";

export { useCompareModels, usePruneCompareIds } from "@/client/hooks/use-compare-models";

const MAX_COMPARE = 2;
const COMPARE_STORE_VERSION = 0;

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0))].slice(
    0,
    MAX_COMPARE,
  );
}

function readCompareIds(): string[] {
  const stored = loadPersistedState<{ compareIds?: unknown }>("session", STORAGE_KEYS.compare, COMPARE_STORE_VERSION);
  return cleanIds(stored.compareIds);
}

export const useCompareStore = defineStore("compare", {
  state: () => ({
    compareIds: readCompareIds(),
    exceedAt: null as number | null,
  }),
  actions: {
    toggleCompareModel(model: ArtificialAnalysisModel): boolean {
      const key = modelId(model);
      if (!key) return false;
      if (this.compareIds.includes(key)) {
        this.compareIds = this.compareIds.filter((id) => id !== key);
        return true;
      }
      if (this.compareIds.length >= MAX_COMPARE) {
        this.exceedAt = Date.now();
        return false;
      }
      this.compareIds = [...this.compareIds, key];
      return true;
    },
    removeCompareModel(model: { id?: string; slug?: string }): void {
      const key = modelId(model);
      if (!key) return;
      this.compareIds = this.compareIds.filter((id) => id !== key);
    },
    pruneCompare(validIds: ReadonlySet<string>): string[] {
      const removed = this.compareIds.filter((id) => !validIds.has(id));
      const kept = this.compareIds.filter((id) => validIds.has(id));
      if (kept.length !== this.compareIds.length) this.compareIds = kept;
      return removed;
    },
    clearCompare() {
      this.compareIds = [];
    },
    clearExceed() {
      this.exceedAt = null;
    },
  },
});

export const initCompareStorageSync = makeStorageSync({
  useStore: useCompareStore,
  kind: "session",
  key: STORAGE_KEYS.compare,
  version: COMPARE_STORE_VERSION,
  snapshot: (store) => ({ compareIds: store.compareIds }),
  onStorageEvent: (store, parsed) => {
    const ids = cleanIds((parsed as { state?: { compareIds?: unknown } }).state?.compareIds);
    if (ids.join("\0") !== store.compareIds.join("\0")) store.compareIds = ids;
  },
});
