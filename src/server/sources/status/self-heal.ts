import { ONE_MINUTE } from "@/shared/config";
import { SAMPLE_LOCK_TTL_S, SAMPLE_SELF_HEAL_MS, STALE_SAMPLE_WARN_MS, STALE_WARN_THROTTLE_MS } from "@/server/config/status";
import type { AppContext } from "@/server/context";
import { errMsg } from "@/server/infra/errors";
import { throttleGate } from "@/server/infra/throttle";
import { recordStatusSamples } from "./sampling";
import type { HistoryStore } from "./schema";
import { readStoreResult } from "./store-read";

const staleWarnGate = throttleGate(STALE_WARN_THROTTLE_MS);
const selfHealGate = throttleGate(SAMPLE_LOCK_TTL_S * 1000);

interface FreshSamples {
  store: HistoryStore;
}

export async function ensureFreshSamplesWithHealth(ctx: AppContext): Promise<FreshSamples> {
  const firstRead = await readStoreResult(ctx);
  const store = firstRead.store;
  const latest = latestSampleAt(store);
  if (ctx.kv) warnStaleSamples(ctx, latest);
  const now = Date.now();
  const ageMs = latest > 0 ? now - latest : null;
  if (ageMs !== null && ageMs <= SAMPLE_SELF_HEAL_MS) return { store };
  if (!selfHealGate.open()) return { store };
  const reason = ageMs === null ? "no samples recorded yet" : `${Math.round(ageMs / ONE_MINUTE)} min without samples`;
  ctx.log("info", `[status-history] ${reason}, running self-heal round`);
  if (ctx.onDetach) {
    try {
      ctx.onDetach(
        recordStatusSamples(ctx, now).then(undefined, (err: unknown) => {
          ctx.log("warn", `[status-history] detached self-heal round failed: ${errMsg(err)}`);
        }),
      );
    } catch (err) {
      ctx.log("warn", `[status-history] detached self-heal scheduling failed: ${errMsg(err)}`);
    }
    return { store };
  }
  try {
    await recordStatusSamples(ctx, now);
    const after = await readStoreResult(ctx);
    return { store: after.store };
  } catch (err) {
    ctx.log("warn", `[status-history] self-heal round failed, serving existing history: ${errMsg(err)}`);
    return { store };
  }
}

function latestSampleAt(store: HistoryStore): number {
  let latest = 0;
  for (const entry of Object.values(store.sources)) {
    const t = entry?.recent.at(-1)?.t ?? 0;
    if (t > latest) latest = t;
  }
  return latest;
}

function warnStaleSamples(ctx: AppContext, latest: number): void {
  const now = Date.now();
  if (latest === 0 || now - latest <= STALE_SAMPLE_WARN_MS) return;
  if (!staleWarnGate.open()) return;
  ctx.log("warn", "[status-history] samples are stale: background sampling may be delayed", {
    latestSampleAt: new Date(latest).toISOString(),
    ageHours: Math.round((now - latest) / 3_600_000),
  });
}
