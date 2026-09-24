import { create } from "zustand";
import { DEFAULT_COST_SCENARIO } from "@/shared/config";
import type { CostFieldId } from "@/client/pricing/cost-inputs";

const DEFAULT_VALUES: Record<CostFieldId, string> = {
  dailyInput: String(DEFAULT_COST_SCENARIO.dailyInputM),
  dailyOutput: String(DEFAULT_COST_SCENARIO.dailyOutputM),
  dailyReasoning: String(DEFAULT_COST_SCENARIO.dailyReasoningM),
  cacheHitRate: String(DEFAULT_COST_SCENARIO.cacheHitRate * 100),
  cacheWriteRate: String(DEFAULT_COST_SCENARIO.cacheWriteRate * 100),
  daysPerMonth: String(DEFAULT_COST_SCENARIO.daysPerMonth),
};

interface CostState {
  values: Record<CostFieldId, string>;
  setField: (id: CostFieldId, value: string) => void;
}

export const useCostStore = create<CostState>((set) => ({
  values: DEFAULT_VALUES,
  setField: (id, value) =>
    set((state) => (state.values[id] === value ? state : { values: { ...state.values, [id]: value } })),
}));
