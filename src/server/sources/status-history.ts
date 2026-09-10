import type { AppContext } from "@/server/context";
import { cacheKeys } from "@/server/config";
import { ensureFreshSamples } from "@/server/sources/status/store";
import { getUptime } from "@/server/sources/status/uptime";
import { buildHistoryPayload } from "@/server/sources/status/payload";

// Short server-side cache (30s): the route additionally caps browsers/CDN at
// 15-30s, but every request otherwise pays 2 KV reads + a full 30-day payload copy.
// Underlying samples only change on the 30min cron, so 30s staleness is safe.
const STATUS_PAYLOAD_TTL_MS = 30_000;

export async function getStatusHistory(ctx: AppContext) {
  return ctx.cache.withTtl(cacheKeys.statusHistoryPayload, STATUS_PAYLOAD_TTL_MS, async () => {
    const [store, uptime] = await Promise.all([ensureFreshSamples(ctx), getUptime(ctx)]);
    const data = buildHistoryPayload(store, uptime, Date.now(), ctx.kv != null);
    return { data, ttl: STATUS_PAYLOAD_TTL_MS };
  });
}
