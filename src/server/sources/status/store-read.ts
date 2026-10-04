import { kvReadWarnGate } from "@/server/infra/throttle";
import { errMsg } from "@/server/infra/errors";
import type { AppContext } from "@/server/context";
import { HISTORY_KEY, salvageStore, type HistoryStore } from "./schema";

let memoryStore: HistoryStore = { sources: {} };

function memoryOrEmpty(): HistoryStore {
  return Object.keys(memoryStore.sources).length > 0 ? memoryStore : { sources: {} };
}

export function setMemoryStore(store: HistoryStore): void {
  memoryStore = store;
}

function warnKvReadFailure(ctx: AppContext, err: unknown): void {
  if (!kvReadWarnGate.open()) return;
  ctx.log("warn", `[status-history] KV read failed, serving memory: ${errMsg(err)}`);
}

export interface StoreRead {
  store: HistoryStore;
  canWriteToKv: boolean;
}

export async function readStoreResult(ctx: AppContext): Promise<StoreRead> {
  if (!ctx.kv) return { store: memoryStore, canWriteToKv: false };
  let raw: string | null;
  try {
    raw = await ctx.kv.get(HISTORY_KEY);
  } catch (err) {
    warnKvReadFailure(ctx, err);
    return { store: memoryStore, canWriteToKv: false };
  }
  if (raw == null) return { store: memoryOrEmpty(), canWriteToKv: true };
  try {
    const salvaged = salvageStore(JSON.parse(raw));
    if (salvaged) return { store: salvaged, canWriteToKv: true };
  } catch {}
  try {
    await ctx.kv.delete(HISTORY_KEY);
  } catch (err) {
    ctx.log("warn", `[status-history] corrupt history clear failed: ${errMsg(err)}`);
  }
  return { store: memoryOrEmpty(), canWriteToKv: Object.keys(memoryStore.sources).length === 0 };
}
