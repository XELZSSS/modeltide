import { useMemo } from "react";
import { useCompareStore } from "@/client/stores";
import { modelId } from "@/client/utils";
import type { ArtificialAnalysisModel } from "@/shared/types";

/**
 * Resolves the compared model ids from the compare store into full model objects
 * from the given Artificial Analysis rankings, preserving the store's order.
 */
export function useCompareModels(rankings: ArtificialAnalysisModel[]): ArtificialAnalysisModel[] {
  const compareIds = useCompareStore((s) => s.compareIds);
  const rankingMap = useMemo(() => {
    const map = new Map<string, ArtificialAnalysisModel>();
    for (const m of rankings) {
      const id = modelId(m);
      if (id) map.set(id, m);
    }
    return map;
  }, [rankings]);
  return useMemo(
    () => compareIds.map((id) => rankingMap.get(id)).filter((m): m is ArtificialAnalysisModel => !!m),
    [compareIds, rankingMap],
  );
}
