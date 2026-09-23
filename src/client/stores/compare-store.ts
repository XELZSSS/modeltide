import { persist } from "zustand/middleware";
import { create } from "zustand";
import { useEffect, useMemo } from "react";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/client/utils/model-utils";
import { sessionJsonStorage } from "@/client/stores/persist";

const MAX_COMPARE = 2;

function cleanIds(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0))].slice(
    0,
    MAX_COMPARE,
  );
}

interface CompareState {
  compareIds: string[];
  lastExceedAt: number | null;
  toggleCompareModel: (model: ArtificialAnalysisModel) => boolean;
  removeCompareModel: (model: { id?: string; slug?: string }) => void;
  pruneCompare: (validIds: ReadonlySet<string>) => void;
  clearCompare: () => void;
  clearExceed: () => void;
}

export const useCompareStore = create<CompareState>()(
  persist(
    (set, get) => ({
      compareIds: [],
      lastExceedAt: null,
      toggleCompareModel: (model) => {
        const key = modelId(model);
        if (!key) return false;
        const state = get();
        if (state.compareIds.includes(key)) {
          set({ compareIds: state.compareIds.filter((id) => id !== key), lastExceedAt: null });
          return true;
        }
        if (state.compareIds.length >= MAX_COMPARE) {
          set({ lastExceedAt: Date.now() });
          return false;
        }
        set({ compareIds: [...state.compareIds, key], lastExceedAt: null });
        return true;
      },
      removeCompareModel: (model) =>
        set((state) => {
          const key = modelId(model);
          if (!key) return state;
          return { compareIds: state.compareIds.filter((id) => id !== key), lastExceedAt: null };
        }),
      pruneCompare: (validIds) =>
        set((state) => {
          const kept = state.compareIds.filter((id) => validIds.has(id));
          // Same-object return: a no-op prune must not notify subscribers.
          return kept.length === state.compareIds.length ? state : { compareIds: kept, lastExceedAt: null };
        }),
      clearCompare: () => set({ compareIds: [], lastExceedAt: null }),
      clearExceed: () => set({ lastExceedAt: null }),
    }),
    {
      name: STORAGE_KEYS.compare,
      storage: sessionJsonStorage,
      partialize: (state) => ({ compareIds: state.compareIds }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { compareIds?: unknown };
        return { ...current, compareIds: cleanIds(p.compareIds) };
      },
    },
  ),
);

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
    () => compareIds.map((id) => rankingMap.get(id)).filter((m): m is ArtificialAnalysisModel => m != null),
    [compareIds, rankingMap],
  );
}

/** Drops stored ids the model list no longer has; a stale id still counts against MAX_COMPARE. */
export function usePruneCompareIds(models: ArtificialAnalysisModel[], opts?: { ready?: boolean }): void {
  const pruneCompare = useCompareStore((s) => s.pruneCompare);
  const validIds = useMemo(() => new Set(models.map(modelId).filter(Boolean)), [models]);
  const ready = opts?.ready ?? true;
  useEffect(() => {
    // Only a loaded, non-empty list may drop them: a failed or empty list proves nothing.
    if (!ready || validIds.size === 0) return;
    pruneCompare(validIds);
  }, [validIds, ready, pruneCompare]);
}
