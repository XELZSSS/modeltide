import { computed, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { defineStore } from "pinia";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/shared/utils/models";
import { initStorageSync, readPersisted, safeStorage } from "@/client/stores/persist";

const MAX_COMPARE = 2;
const VERSION = 0;

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0))].slice(
    0,
    MAX_COMPARE,
  );
}

function readCompareIds(): string[] {
  const stored = readPersisted<{ compareIds?: unknown }>(safeStorage("session"), STORAGE_KEYS.compare, VERSION);
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

export function initCompareStorageSync(): void {
  initStorageSync(useCompareStore(), {
    storage: safeStorage("session"),
    key: STORAGE_KEYS.compare,
    version: VERSION,
    snapshot: (store) => ({ compareIds: store.compareIds }),
    onStorageEvent: (store, parsed) => {
      const ids = cleanIds((parsed as { state?: { compareIds?: unknown } }).state?.compareIds);
      if (ids.join("\0") !== store.compareIds.join("\0")) store.compareIds = ids;
    },
  });
}

export function useCompareModels(
  rankings: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
): ComputedRef<ArtificialAnalysisModel[]> {
  const store = useCompareStore();
  const rankingMap = computed(() => {
    const map = new Map<string, ArtificialAnalysisModel>();
    for (const model of toValue(rankings) ?? []) {
      if (model == null) continue;
      const id = modelId(model);
      if (id) map.set(id, model);
    }
    return map;
  });
  return computed(() =>
    store.compareIds
      .map((id) => rankingMap.value.get(id))
      .filter((model): model is ArtificialAnalysisModel => model != null),
  );
}

export function usePruneCompareIds(
  models: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
  onPruned?: (removed: string[]) => void,
): void {
  const store = useCompareStore();
  const validIds = computed(() => new Set((toValue(models) ?? []).map(modelId).filter(Boolean)));
  watch(
    validIds,
    (ids) => {
      const removed = store.pruneCompare(ids);
      if (removed.length > 0) onPruned?.(removed);
    },
    { immediate: true },
  );
}
