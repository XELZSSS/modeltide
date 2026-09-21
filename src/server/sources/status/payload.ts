import { SOURCE_IDS } from "@/shared/config";
import type { SourceId, StatusHistoryPayload, StatusEvent } from "@/shared/types";
import { buildSourceSummary, deriveEvents, emptyEntry, type HistoryStore } from "./history-math";
import type { UptimePayload } from "./uptime";

const MAX_EVENTS = 50;

export function buildHistoryPayload(
  store: HistoryStore,
  uptime: UptimePayload,
  now = Date.now(),
  persisted = true,
): StatusHistoryPayload {
  const ids: SourceId[] = [...SOURCE_IDS];
  const recent: StatusHistoryPayload["recent"] = {};
  const daily: StatusHistoryPayload["daily"] = {};
  const sources: StatusHistoryPayload["sources"] = [];
  const events: StatusEvent[] = [];

  for (const id of ids) {
    const entry = store.sources[id] ?? emptyEntry();
    recent[id] = [...entry.recent];
    daily[id] = [...entry.daily];
    events.push(...deriveEvents(id, entry.recent));
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
  };
}
