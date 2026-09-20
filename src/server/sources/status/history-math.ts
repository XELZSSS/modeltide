import { ONE_DAY, ONE_MINUTE, UPTIME_WARN_RATIO } from "@/shared/config";
import type {
  DayBucket,
  SourceHealthLevel,
  SourceHistorySummary,
  SourceLevel,
  SourceStatus,
  StatusEvent,
  UptimeSample,
} from "@/shared/types";

export const SAMPLE_UPSERT_WINDOW_MS = 4 * ONE_MINUTE;
export const RECENT_WINDOW_MS = ONE_DAY;
export const RETAINED_DAYS = 30;

export type SourceId = SourceStatus["id"];

export interface HistorySourceEntry {
  recent: UptimeSample[];
  daily: DayBucket[];
}

export interface HistoryStore {
  sources: Partial<Record<SourceId, HistorySourceEntry>>;
}

export const emptyEntry = (): HistorySourceEntry => ({ recent: [], daily: [] });

export const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

function samplesInWindow(samples: UptimeSample[], windowStartMs: number): UptimeSample[] {
  return samples.filter((s) => s.t >= windowStartMs);
}

export function uptimeRatio(samples: UptimeSample[], windowStartMs: number): number | null {
  const inWindow = samplesInWindow(samples, windowStartMs);
  if (inWindow.length === 0) return null;
  return inWindow.filter((s) => s.ok).length / inWindow.length;
}

export function avgLatency(samples: UptimeSample[], windowStartMs: number): number | null {
  const values = samplesInWindow(samples, windowStartMs)
    .filter((s) => s.ok && s.latencyMs != null)
    .map((s) => s.latencyMs!);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

interface OpenIncident {
  type: "down" | "degraded";
  at: number;
  index: number;
}

export function deriveEvents(id: SourceId, samples: UptimeSample[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  let open: OpenIncident | null = null;
  const close = (at: number, pushUp: boolean): void => {
    if (open) {
      const ev = events[open.index];
      if (ev) ev.durationMin = Math.round((at - open.at) / ONE_MINUTE);
    }
    if (pushUp) events.push({ id, type: "up", at: new Date(at).toISOString(), durationMin: null });
    open = null;
  };
  for (const sample of samples) {
    const level: SourceLevel = !sample.ok ? "error" : sample.warn === true ? "warn" : "ok";
    if (level === "error") {
      if (open?.type === "degraded") close(sample.t, false);
      if (!open) {
        open = { type: "down", at: sample.t, index: events.length };
        events.push({ id, type: "down", at: new Date(sample.t).toISOString(), durationMin: null });
      }
    } else if (level === "warn") {
      if (open?.type === "down") close(sample.t, true);
      if (!open) {
        open = { type: "degraded", at: sample.t, index: events.length };
        events.push({ id, type: "degraded", at: new Date(sample.t).toISOString(), durationMin: null });
      }
    } else if (open) {
      close(sample.t, true);
    }
  }
  return events;
}

function applySampleDelta(bucket: DayBucket, sample: UptimeSample, dir: 1 | -1): void {
  bucket.total = Math.max(0, bucket.total + dir);
  if (sample.ok) {
    bucket.ok = Math.max(0, bucket.ok + dir);
  }
}

function pruneWindows(recent: UptimeSample[], daily: DayBucket[], now: number): HistorySourceEntry {
  const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
  return {
    recent: recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
    daily: daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
  };
}

export function mergeSample(
  entry: HistorySourceEntry | undefined,
  sample: UptimeSample,
  now: number,
): HistorySourceEntry {
  const prevEntry = entry ?? emptyEntry();
  const recent = [...prevEntry.recent];
  const last = recent.at(-1);
  const isUpsert = last != null && sample.t >= last.t && sample.t - last.t < SAMPLE_UPSERT_WINDOW_MS / 2;
  if (last != null && sample.t <= last.t) return prevEntry;
  if (isUpsert) {
    const lastBucket = prevEntry.daily.find((b) => b.day === utcDay(last.t));
    if (lastBucket) applySampleDelta(lastBucket, last, -1);
    recent[recent.length - 1] = sample;
  } else {
    recent.push(sample);
  }
  const prunedRecent = recent.filter((s) => s.t > now - RECENT_WINDOW_MS);

  const daily = prevEntry.daily.map((b) => ({ ...b }));
  const day = utcDay(sample.t);
  let bucket = daily.find((b) => b.day === day);
  if (!bucket) {
    bucket = { day, total: 0, ok: 0 };
    daily.push(bucket);
  }
  applySampleDelta(bucket, sample, 1);

  return pruneWindows(prunedRecent, daily, now);
}

export function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const buckets = entry.daily.slice(-7);
  const sumOk = buckets.reduce((a, b) => a + b.ok, 0);
  const sumTotal = buckets.reduce((a, b) => a + b.total, 0);
  const retained = entry.daily.slice(-RETAINED_DAYS);
  const total30 = retained.reduce((a, b) => a + b.total, 0);
  const uptime24h = uptimeRatio(entry.recent, now - RECENT_WINDOW_MS);
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
