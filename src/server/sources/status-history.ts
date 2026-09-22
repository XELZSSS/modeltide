import type { AppContext } from "@/server/context";
import { cacheKeys } from "@/server/config";
import { buildHistoryPayload, ensureFreshSamples, getUptime } from "@/server/sources/status";
import { cached } from "@/server/sources/pipeline";

const STATUS_PAYLOAD_TTL_MS = 30_000;

export async function getStatusHistory(ctx: AppContext) {
  return cached(
    ctx,
    cacheKeys.statusHistoryPayload,
    STATUS_PAYLOAD_TTL_MS,
    async () => {
      const [store, uptime] = await Promise.all([ensureFreshSamples(ctx), getUptime(ctx)]);
      const data = buildHistoryPayload(store, uptime, Date.now(), ctx.kv != null);
      return { data, ttl: STATUS_PAYLOAD_TTL_MS };
    },
    { memoryOnly: true },
  );
}
