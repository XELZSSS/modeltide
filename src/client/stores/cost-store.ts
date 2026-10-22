import { defineStore } from "pinia";
import { STORAGE_KEYS } from "@/shared/config";
import { loadPersistedState, makeStorageSync } from "./make-persisted-store";
import type { CostFieldId } from "@/shared/scenario";

const COST_STORE_VERSION = 1;

const DEFAULT_VALUES: Record<CostFieldId, string> = {
  dailyInput: "2",
  dailyOutput: "1",
  dailyReasoning: "2",
  cacheHitRate: "50",
  cacheWriteRate: "5",
  daysPerMonth: "22",
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
  const stored = loadPersistedState<{ values?: unknown }>("local", STORAGE_KEYS.cost, COST_STORE_VERSION);
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

export const initCostStorageSync = makeStorageSync({
  useStore: useCostStore,
  kind: "local",
  key: STORAGE_KEYS.cost,
  version: COST_STORE_VERSION,
  snapshot: (store) => ({ values: store.values }),
  onStorageEvent: (store, parsed) => {
    const values = cleanValues((parsed as { state?: { values?: unknown } }).state?.values);
    const changed = COST_FIELD_IDS.some((id) => values[id] !== store.values[id]);
    if (changed) store.values = values;
  },
});
