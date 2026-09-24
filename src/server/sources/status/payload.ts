import { SOURCE_IDS } from "@/shared/config";
import type { StatusEvent, StatusHistoryPayload, StatusStoreMode } from "@/shared/types/status";
import { buildSourceSummary, deriveEvents } from "./history-math";
import { emptyEntry, type HistoryStore } from "./schema";
import type { UptimePayload } from "./uptime";

const MAX_EVENTS = 50;

export function buildHistoryPayload(
  store: HistoryStore,
  uptime: UptimePayload,
  now = Date.now(),
  persisted = true,
  storeMode?: StatusStoreMode,
): StatusHistoryPayload {
  const recent: StatusHistoryPayload["recent"] = {};
  const daily: StatusHistoryPayload["daily"] = {};
  const sources: StatusHistoryPayload["sources"] = [];
  const events: StatusEvent[] = [];

  for (const id of SOURCE_IDS) {
    const entry = store.sources[id] ?? emptyEntry();
    recent[id] = [...entry.recent];
    daily[id] = [...entry.daily];
    events.push(...deriveEvents(id, entry.recent, entry.openSince));
    sources.push(buildSourceSummary(id, entry, now));
  }

  events.sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
  return {
    firstLaunchAt: uptime.firstLaunchAt,
    uptimeMs: uptime.uptimeMs,
    sources,
    recent,
    daily,
    events: events.slice(0, MAX_EVENTS),
    persisted,
    ...(storeMode ? { storeMode } : {}),
  };
}
