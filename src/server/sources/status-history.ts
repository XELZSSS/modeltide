import type { AppContext } from "@/server/context";
import { ensureFreshSamples } from "@/server/sources/status/store";
import { getUptime } from "@/server/sources/status/uptime";
import { buildHistoryPayload } from "@/server/sources/status/payload";

export async function getStatusHistory(ctx: AppContext) {
  const [store, uptime] = await Promise.all([ensureFreshSamples(ctx), getUptime(ctx)]);
  return buildHistoryPayload(store, uptime, Date.now(), ctx.kv != null);
}
