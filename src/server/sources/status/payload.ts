import { ONE_DAY, SOURCE_IDS, UPTIME_WARN_RATIO } from "@/shared/config";
import type { SourceHealthLevel, SourceHistorySummary, StatusEvent, StatusHistoryPayload } from "@/shared/types";
import type { UptimePayload } from "@/server/sources/status/uptime";
import {
  RECENT_WINDOW_MS,
  RETAINED_DAYS,
  avgLatency,
  deriveEvents,
  emptyEntry,
  uptimeRatio,
  utcDay,
  type HistorySourceEntry,
  type HistoryStore,
  type SourceId,
} from "@/server/sources/status/windows";

const MAX_EVENTS = 50;

function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const day7Cutoff = now - 7 * ONE_DAY;
  const buckets = entry.daily.filter((b) => b.day >= utcDay(day7Cutoff));
  const sumOk = buckets.reduce((a, b) => a + b.ok, 0);
  const sumTotal = buckets.reduce((a, b) => a + b.total, 0);
  const retained = entry.daily.slice(-RETAINED_DAYS);
  const total30 = retained.reduce((a, b) => a + b.total, 0);
  const uptime24h = uptimeRatio(entry.recent, now - RECENT_WINDOW_MS);
  // Tri-level health: error = last sample failed; warn = currently up but degraded
  // (provider page) or flaky — any outage in the last 24h drops a 48-sample day
  // below the 99.5% green band shared with the uptime strip.
  let level: SourceHealthLevel;
  if (!last) level = "unknown";
  else if (!last.ok) level = "error";
  else if (last.warn === true || (uptime24h != null && uptime24h < UPTIME_WARN_RATIO)) level = "warn";
  else level = "ok";
  return {
    id,
    ok: last ? last.ok : false,
    level,
    latencyMs: last ? last.latencyMs : null,
    checkedAt: last ? new Date(last.t).toISOString() : null,
    uptime24h,
    uptime7d: sumTotal > 0 ? sumOk / sumTotal : null,
    uptime30d: total30 > 0 ? retained.reduce((a, b) => a + b.ok, 0) / total30 : null,
    avgLatency24h: avgLatency(entry.recent, now - RECENT_WINDOW_MS),
  };
}

export function buildHistoryPayload(
  store: HistoryStore,
  uptime: UptimePayload,
  now = Date.now(),
  persisted = true,
): StatusHistoryPayload {
  const ids: SourceId[] = [...SOURCE_IDS];
  const recent: StatusHistoryPayload["recent"] = {};
  const daily: StatusHistoryPayload["daily"] = {};
  const sources: SourceHistorySummary[] = [];
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
    generatedAt: new Date(now).toISOString(),
    persisted,
  };
}
