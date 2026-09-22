import { ONE_DAY, ONE_MINUTE, UPTIME_ERROR_RATIO, UPTIME_WARN_RATIO } from "@/shared/config";
import type {
  DayBucket,
  SourceHealthLevel,
  SourceHistorySummary,
  SourceId,
  StatusEvent,
  UptimeSample,
} from "@/shared/types";

export const SAMPLE_UPSERT_WINDOW_MS = 4 * ONE_MINUTE;
export const RECENT_WINDOW_MS = ONE_DAY;
export const RETAINED_DAYS = 30;

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

/**
 * Why a sample is not fully healthy: the failure detail when it is down, the
 * provider's degradation warning when it is merely degraded.
 */
function sampleReason(sample: UptimeSample): string | null {
  if (!sample.ok) return sample.error ?? null;
  if (sample.warn === true) return sample.warnReason ?? null;
  return null;
}

export function deriveEvents(id: SourceId, samples: UptimeSample[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  let open: OpenIncident | null = null;
  const close = (at: number, pushUp: boolean): void => {
    if (open) {
      const ev = events[open.index];
      if (ev) ev.durationMin = Math.round((at - open.at) / ONE_MINUTE);
    }
    if (pushUp) events.push({ id, type: "up", at: new Date(at).toISOString(), durationMin: null, detail: null });
    open = null;
  };
  for (const sample of samples) {
    const want: OpenIncident["type"] | null = !sample.ok ? "down" : sample.warn === true ? "degraded" : null;
    // Leaving an incident emits "up" except when sliding straight into "down".
    if (open && open.type !== want) close(sample.t, want === null || (open.type === "down" && want === "degraded"));
    if (want && !open) {
      open = { type: want, at: sample.t, index: events.length };
      events.push({
        id,
        type: want,
        at: new Date(sample.t).toISOString(),
        durationMin: null,
        detail: sampleReason(sample),
      });
      continue;
    }
    // A running incident takes the newest reason: providers rewrite their warning
    // text while the incident is open.
    const detail = sampleReason(sample);
    const ev = open ? events[open.index] : undefined;
    if (ev && detail != null) ev.detail = detail;
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

function rollbackLastSample(daily: DayBucket[], last: UptimeSample): void {
  const lastBucket = daily.find((b) => b.day === utcDay(last.t));
  if (lastBucket) applySampleDelta(lastBucket, last, -1);
}

export function mergeSample(
  entry: HistorySourceEntry | undefined,
  sample: UptimeSample,
  now: number,
): HistorySourceEntry {
  const prevEntry = entry ?? emptyEntry();
  const recent = [...prevEntry.recent];
  const last = recent.at(-1);
  if (last != null && sample.t <= last.t) return prevEntry;
  const isUpsert = last != null && sample.t - last.t < SAMPLE_UPSERT_WINDOW_MS / 2;
  const daily = prevEntry.daily.map((b) => ({ ...b }));
  if (isUpsert) {
    rollbackLastSample(daily, last);
    recent[recent.length - 1] = sample;
  } else {
    recent.push(sample);
  }

  const day = utcDay(sample.t);
  let bucket = daily.find((b) => b.day === day);
  if (!bucket) {
    bucket = { day, total: 0, ok: 0 };
    daily.push(bucket);
  }
  applySampleDelta(bucket, sample, 1);

  return pruneWindows(recent, daily, now);
}

export function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const buckets = entry.daily.slice(-7);
  const sumOk = buckets.reduce((a, b) => a + b.ok, 0);
  const sumTotal = buckets.reduce((a, b) => a + b.total, 0);
  const uptime24h = uptimeRatio(entry.recent, now - RECENT_WINDOW_MS);
  let level: SourceHealthLevel;
  // Same bands as the 30-day strip: most of the last 24h down is not "warn".
  if (!last) level = "unknown";
  else if (!last.ok || (uptime24h != null && uptime24h < UPTIME_ERROR_RATIO)) level = "error";
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
    avgLatency24h: avgLatency(entry.recent, now - RECENT_WINDOW_MS),
    detail: last ? sampleReason(last) : null,
  };
}
