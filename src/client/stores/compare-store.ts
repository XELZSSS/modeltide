import { computed, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { defineStore } from "pinia";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/shared/utils/models";
import { readPersisted, safeStorage, writePersisted } from "@/client/stores/persist";

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
    pruneCompare(validIds: ReadonlySet<string>): void {
      const kept = this.compareIds.filter((id) => validIds.has(id));
      if (kept.length !== this.compareIds.length) this.compareIds = kept;
    },
    clearCompare() {
      this.compareIds = [];
    },
    clearExceed() {
      this.exceedAt = null;
    },
  },
});

let syncing = false;

export function initCompareStorageSync(): void {
  if (syncing) return;
  syncing = true;
  const storage = safeStorage("session");
  useCompareStore().$subscribe(
    (_mutation, state) => writePersisted(storage, STORAGE_KEYS.compare, VERSION, { compareIds: state.compareIds }),
    {
      detached: true,
    },
  );
}

export function useCompareModels(
  rankings: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
): ComputedRef<ArtificialAnalysisModel[]> {
  const store = useCompareStore();
  const rankingMap = computed(() => {
    const map = new Map<string, ArtificialAnalysisModel>();
    for (const model of toValue(rankings)) {
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

export function usePruneCompareIds(models: MaybeRefOrGetter<ArtificialAnalysisModel[]>): void {
  const store = useCompareStore();
  const validIds = computed(() => new Set(toValue(models).map(modelId).filter(Boolean)));
  watch(
    validIds,
    (ids) => {
      if (ids.size === 0) return;
      store.pruneCompare(ids);
    },
    { immediate: true },
  );
}
