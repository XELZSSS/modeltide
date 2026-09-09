import { ONE_DAY, ONE_MINUTE } from "@/shared/config";
import type { DayBucket, StatusEvent, UptimeSample } from "@/shared/types";
import type { SourceStatus } from "@/shared/types";

// Samples are written by the 30-minute cron (`triggers.crons` in wrangler.jsonc);
// the old 40-minute SAMPLE_INTERVAL_MS constant was unused and removed.
const SAMPLE_UPSERT_WINDOW_MS = 4 * ONE_MINUTE;
export const RECENT_WINDOW_MS = ONE_DAY;
/** History retention cap (30 days): daily buckets older than this are pruned on every merge. */
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

export function deriveEvents(id: SourceId, samples: UptimeSample[]): StatusEvent[] {
  const events: StatusEvent[] = [];
  let downAt: number | null = null;
  let openDownIndex = -1;
  for (const sample of samples) {
    if (!sample.ok && downAt == null) {
      downAt = sample.t;
      openDownIndex = events.length;
      events.push({ id, type: "down", at: new Date(sample.t).toISOString(), durationMin: null });
    } else if (sample.ok && downAt != null) {
      const down = events[openDownIndex];
      if (down) down.durationMin = Math.round((sample.t - downAt) / ONE_MINUTE);
      events.push({ id, type: "up", at: new Date(sample.t).toISOString(), durationMin: null });
      downAt = null;
      openDownIndex = -1;
    }
  }
  return events;
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
    // Roll back the replaced sample's day-bucket contribution before overwriting it.
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

function applySampleDelta(bucket: DayBucket, sample: UptimeSample, dir: 1 | -1): void {
  bucket.total = Math.max(0, bucket.total + dir);
  if (sample.ok) {
    bucket.ok = Math.max(0, bucket.ok + dir);
  }
}
