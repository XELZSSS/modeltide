import type { AppContext } from "@/server/context";
import { HISTORY_KV_RETENTION_TTL_S } from "@/server/config/status";
import { errMsg } from "@/server/infra/errors";
import type { SourceId } from "@/shared/types";
import type { SourceAggregate } from "./aggregate";
import { mergeSample } from "./history-math";
import { HISTORY_KEY, HISTORY_SCHEMA_VERSION, SAMPLE_LOCK_KEY } from "./schema";
import { readStoreResult, setMemoryStore } from "./store-read";

export async function mergeSamplesIntoStore(
  ctx: AppContext,
  aggregates: Map<SourceId, SourceAggregate>,
  now: number,
  token: string,
): Promise<boolean> {
  const { store, canWriteToKv } = await readStoreResult(ctx);
  // Verify the sample lock before touching shared memory: if the lock was
  // lost, another invocation owns the round and our in-memory update would
  // diverge from KV. Check first, mutate after.
  if (ctx.kv && canWriteToKv) {
    let held: string | null = null;
    try {
      held = await ctx.kv.get(SAMPLE_LOCK_KEY);
    } catch (err) {
      ctx.log("warn", `[status-history] sample lock verify failed, discarding round: ${errMsg(err)}`);
      return false;
    }
    if (!held || !held.startsWith(`${token}:`)) {
      ctx.log("warn", "[status-history] sample lock lost before persist, discarding round");
      return false;
    }
  }
  for (const [id, agg] of aggregates) {
    store.sources[id] = mergeSample(
      store.sources[id],
      {
        t: now,
        ok: agg.ok,
        latencyMs: agg.latencyMs,
        status: agg.status,
        error: agg.error,
        warn: agg.warn,
        warnReason: agg.warnReason,
      },
      now,
    );
  }
  setMemoryStore(store);
  if (!ctx.kv) return true;
  if (!canWriteToKv) return false;
  try {
    await ctx.kv.put(HISTORY_KEY, JSON.stringify({ v: HISTORY_SCHEMA_VERSION, ...store }), {
      expirationTtl: HISTORY_KV_RETENTION_TTL_S,
    });
    return true;
  } catch (err) {
    ctx.log("warn", `[status-history] KV write failed, serving memory: ${errMsg(err)}`);
    return false;
  }
}
