import { SOURCE_IDS } from "@/shared/config";
import type { StatusEvent, StatusHistoryPayload, StatusStoreMode } from "@/shared/types/status";
import { buildSourceSummary, deriveEvents } from "./history-math";
import type { HistoryStore } from "./schema";
import type { UptimePayload } from "./uptime";

const MAX_EVENTS = 50;

export function buildHistoryPayload(
  store: HistoryStore,
  uptime: UptimePayload,
  storeMode: StatusStoreMode,
): StatusHistoryPayload {
  const recent: StatusHistoryPayload["recent"] = {};
  const sources: StatusHistoryPayload["sources"] = [];
  const events: StatusEvent[] = [];

  for (const id of SOURCE_IDS) {
    const entry = store.sources[id];
    if (!entry || entry.recent.length === 0) continue;
    recent[id] = [...entry.recent];
    events.push(...deriveEvents(id, entry.recent, entry.openSince));
    sources.push(buildSourceSummary(id, entry));
  }

  // Parse timestamps once instead of inside the comparator (O(n log n) Date.parse calls).
  const stamped = events.map((event) => ({ event, at: Date.parse(event.at) }));
  stamped.sort((a, b) => b.at - a.at);
  return {
    firstLaunchAt: uptime.firstLaunchAt,
    uptimeMs: uptime.uptimeMs,
    sources,
    recent,
    events: stamped.slice(0, MAX_EVENTS).map((s) => s.event),
    storeMode,
  };
}
