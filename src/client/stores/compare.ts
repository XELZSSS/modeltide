"use client";
import { persist } from "zustand/middleware";
import { create } from "zustand";
import { useMemo } from "react";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { STORAGE_KEYS } from "@/shared/config";
import { modelId } from "@/client/utils/model";
import { sessionJsonStorage } from "@/client/stores/storage";

const MAX_COMPARE = 2;

interface CompareState {
  compareIds: string[];
  lastExceedAt: number | null;
  toggleCompareModel: (model: ArtificialAnalysisModel) => boolean;
  removeCompareModel: (model: { id?: string; slug?: string }) => void;
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
      clearCompare: () => set({ compareIds: [], lastExceedAt: null }),
      clearExceed: () => set({ lastExceedAt: null }),
    }),
    {
      name: STORAGE_KEYS.compare,
      storage: sessionJsonStorage,
      partialize: (state) => ({ compareIds: state.compareIds }),
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as { compareIds?: unknown };
        const raw = Array.isArray(p.compareIds) ? p.compareIds : [];
        const clean = Array.from(
          new Set(raw.filter((v): v is string => typeof v === "string" && v.trim().length > 0)),
        ).slice(0, MAX_COMPARE);
        return { ...current, compareIds: clean };
      },
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[compare] rehydrate failed", error);
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
