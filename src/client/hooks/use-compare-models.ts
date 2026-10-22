import { computed, toValue, watch, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelId } from "@/shared/utils/models";
import { useCompareStore } from "@/client/stores/compare-store";

export function useCompareModels(
  rankings: MaybeRefOrGetter<ArtificialAnalysisModel[]>,
): ComputedRef<ArtificialAnalysisModel[]> {
  const store = useCompareStore();
  const rankingMap = computed(() => {
    const map = new Map<string, ArtificialAnalysisModel>();
    for (const model of toValue(rankings)) {
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
  const validIds = computed(() => new Set(toValue(models).map(modelId).filter(Boolean)));
  watch(
    validIds,
    (ids) => {
      if (ids.size === 0) return;
      const removed = store.pruneCompare(ids);
      if (removed.length > 0) onPruned?.(removed);
    },
    { immediate: true },
  );
}
