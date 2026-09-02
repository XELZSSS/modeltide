import type { UptimeSample } from "@/shared/types";
import { ONE_DAY } from "@/shared/config";
import type { HistorySourceEntry } from "./types";
import { SAMPLE_INTERVAL_MS, RECENT_WINDOW_MS, RETAINED_DAYS, emptyEntry, utcDay } from "./types";

/** True when a sample is a new incident: failing with no previous sample or a previous healthy one. */
function isNewIncident(prev: UptimeSample | undefined, sample: UptimeSample): boolean {
  return !sample.ok && (prev === undefined || prev.ok);
}

/** Merge one probe sample into a source's rolling windows (pure). */
export function mergeSample(
  entry: HistorySourceEntry | undefined,
  sample: UptimeSample,
  now: number,
): HistorySourceEntry {
  const prevEntry = entry ?? emptyEntry();
  const recent = [...prevEntry.recent];
  const last = recent[recent.length - 1];
  // Re-serialised cron runs may land inside the same interval: upsert instead of duplicating.
  // Upserts replace the sample but must NOT double-count the daily bucket.
  // Only newer samples within half an interval upsert; older ones are ignored below.
  const isUpsert = last != null && sample.t >= last.t && sample.t - last.t < SAMPLE_INTERVAL_MS / 2;
  // Stale/retried sample older than the newest stored one: ignore to avoid time travel.
  if (last != null && sample.t <= last.t) return prevEntry;
  if (isUpsert) {
    recent[recent.length - 1] = sample;
  } else {
    recent.push(sample);
  }
  const prunedRecent = recent.filter((s) => s.t > now - RECENT_WINDOW_MS);

  const daily = prevEntry.daily.map((b) => ({ ...b }));
  const day = utcDay(sample.t);
  const prevSample = last && last.t < sample.t ? last : undefined;
  let bucket = daily.find((b) => b.day === day);
  if (!bucket) {
    bucket = { day, total: 0, ok: 0, latencySum: 0, latencyN: 0, incidents: 0 };
    daily.push(bucket);
  }
  // Upserts already counted this interval: skip daily accumulation to avoid dilution.
  if (isUpsert) {
    const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
    return {
      recent: recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
      daily: daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
    };
  }
  bucket.total += 1;
  if (sample.ok) {
    bucket.ok += 1;
    if (sample.latencyMs != null) {
      bucket.latencySum += sample.latencyMs;
      bucket.latencyN += 1;
    }
  }
  if (isNewIncident(prevSample, sample)) bucket.incidents += 1;

  const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
  return {
    recent: prunedRecent,
    daily: daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
  };
}
