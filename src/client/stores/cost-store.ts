import { defineStore } from "pinia";
import { DEFAULT_COST_SCENARIO, STORAGE_KEYS } from "@/shared/config";
import { readPersisted, safeStorage, writePersisted } from "@/client/stores/persist";
import type { CostFieldId } from "@/client/pricing/cost-inputs";

const VERSION = 1;

const DEFAULT_VALUES: Record<CostFieldId, string> = {
  dailyInput: String(DEFAULT_COST_SCENARIO.dailyInputM),
  dailyOutput: String(DEFAULT_COST_SCENARIO.dailyOutputM),
  dailyReasoning: String(DEFAULT_COST_SCENARIO.dailyReasoningM),
  cacheHitRate: String(DEFAULT_COST_SCENARIO.cacheHitRate * 100),
  cacheWriteRate: String(DEFAULT_COST_SCENARIO.cacheWriteRate * 100),
  daysPerMonth: String(DEFAULT_COST_SCENARIO.daysPerMonth),
};

const COST_FIELD_IDS = Object.keys(DEFAULT_VALUES) as CostFieldId[];

function cleanValues(raw: unknown): Record<CostFieldId, string> {
  const persisted = (raw ?? {}) as Partial<Record<CostFieldId, unknown>>;
  const values = { ...DEFAULT_VALUES };
  for (const id of COST_FIELD_IDS) {
    const value = persisted[id];
    if (typeof value === "string") values[id] = value;
  }
  return values;
}

function readValues(): Record<CostFieldId, string> {
  const stored = readPersisted<{ values?: unknown }>(safeStorage("local"), STORAGE_KEYS.cost, VERSION);
  return cleanValues(stored.values);
}

export const useCostStore = defineStore("cost", {
  state: () => ({ values: readValues() }),
  actions: {
    setField(id: CostFieldId, value: string) {
      if (this.values[id] === value) return;
      this.values = { ...this.values, [id]: value };
    },
  },
});

let syncing = false;

export function initCostStorageSync(): void {
  if (syncing) return;
  syncing = true;
  const storage = safeStorage("local");
  useCostStore().$subscribe((_mutation, state) => writePersisted(storage, STORAGE_KEYS.cost, VERSION, { values: state.values }), {
    detached: true,
  });
}
