import type { AppContext } from "@/server/context";
import { cacheKeys } from "@/server/config";
import { STATUS_TTL_MS } from "@/shared/config";
import { buildHistoryPayload, ensureFreshSamplesWithHealth, getUptime } from "@/server/sources/status";
import type { SourcePayload, StatusHistoryPayload } from "@/shared/types";
import { cachedPayload } from "@/server/sources/pipeline";

export function getStatusHistory(ctx: AppContext): Promise<SourcePayload<StatusHistoryPayload>> {
  return cachedPayload(
    ctx,
    cacheKeys.statusHistoryPayload,
    STATUS_TTL_MS,
    async () => {
      const [fresh, uptime] = await Promise.all([ensureFreshSamplesWithHealth(ctx), getUptime(ctx)]);
      return { rows: buildHistoryPayload(fresh.store, uptime, Date.now(), fresh.persisted) };
    },
    { memoryOnly: true },
  );
}
