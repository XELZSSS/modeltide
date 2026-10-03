import { ONE_DAY, ONE_MINUTE, UPTIME_ERROR_RATIO, UPTIME_WARN_RATIO } from "@/shared/config";
import type {
  DayBucket,
  SourceHealthLevel,
  SourceHistorySummary,
  SourceId,
  StatusEvent,
  UptimeSample,
} from "@/shared/types";
import { emptyEntry, type HistorySourceEntry } from "./schema";

const RECENT_WINDOW_MS = ONE_DAY;
const RETAINED_DAYS = 30;

const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

type IncidentType = "down" | "degraded";

interface OpenIncident {
  type: IncidentType;
  at: number;
  index: number;
}

function incidentType(sample: UptimeSample): IncidentType | null {
  if (!sample.ok) return "down";
  return sample.warn ? "degraded" : null;
}

function sampleReason(sample: UptimeSample): string | null {
  if (!sample.ok) return sample.error;
  if (sample.warn) return sample.warnReason;
  return null;
}

export function deriveEvents(id: SourceId, samples: UptimeSample[], openSince: number | null = null): StatusEvent[] {
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
  for (let i = 0; i < samples.length; i++) {
    const sample = samples[i]!;
    const want = incidentType(sample);
    if (open && open.type !== want) close(sample.t, want === null);
    if (want && !open) {
      const startedAt = i === 0 && openSince != null && openSince < sample.t ? openSince : sample.t;
      open = { type: want, at: startedAt, index: events.length };
      events.push({
        id,
        type: want,
        at: new Date(startedAt).toISOString(),
        durationMin: null,
        detail: sampleReason(sample),
      });
      continue;
    }
    const detail = sampleReason(sample);
    const ev = open ? events[open.index] : undefined;
    if (ev && detail != null) ev.detail = detail;
  }
  return events;
}

function applySampleDelta(bucket: DayBucket, sample: UptimeSample): void {
  bucket.total += 1;
  if (sample.ok) bucket.ok += 1;
  if (sample.warn) bucket.warn += 1;
}

function pruneWindows(entry: HistorySourceEntry, now: number): HistorySourceEntry {
  const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
  return {
    recent: entry.recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
    daily: entry.daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
    openSince: entry.openSince,
  };
}

function nextOpenSince(
  prev: HistorySourceEntry,
  prevLast: UptimeSample | undefined,
  sample: UptimeSample,
  now: number,
): number | null {
  const want = incidentType(sample);
  if (want == null) return null;
  const continues = prevLast != null && prevLast.t > now - RECENT_WINDOW_MS && incidentType(prevLast) === want;
  return continues ? prev.openSince : sample.t;
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
  recent.push(sample);

  const day = utcDay(sample.t);
  // Copy only the bucket being mutated instead of every daily bucket.
  const daily: DayBucket[] = [];
  let bucket: DayBucket | undefined;
  for (const b of prevEntry.daily) {
    if (b.day === day) {
      bucket = { ...b };
      daily.push(bucket);
    } else {
      daily.push(b);
    }
  }
  if (!bucket) {
    bucket = { day, total: 0, ok: 0, warn: 0 };
    daily.push(bucket);
  }
  applySampleDelta(bucket, sample);

  return pruneWindows({ recent, daily, openSince: nextOpenSince(prevEntry, last, sample, now) }, now);
}

export function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const windowStartMs = now - RECENT_WINDOW_MS;
  let windowTotal = 0;
  let windowOk = 0;
  let windowWarn = 0;
  let latencySum = 0;
  let latencyCount = 0;
  for (const sample of entry.recent) {
    if (sample.t < windowStartMs) continue;
    windowTotal += 1;
    if (sample.ok) {
      windowOk += 1;
      if (sample.latencyMs != null) {
        latencySum += sample.latencyMs;
        latencyCount += 1;
      }
    }
    if (sample.warn) windowWarn += 1;
  }
  const buckets = entry.daily.slice(-7);
  let sumOk = 0;
  let sumTotal = 0;
  for (const bucket of buckets) {
    sumOk += bucket.ok;
    sumTotal += bucket.total;
  }
  const uptime24h = windowTotal > 0 ? windowOk / windowTotal : null;
  let level: SourceHealthLevel;
  if (!last) level = "unknown";
  else if (!last.ok || (uptime24h != null && uptime24h < UPTIME_ERROR_RATIO)) level = "error";
  else if (last.warn || (uptime24h != null && uptime24h < UPTIME_WARN_RATIO)) level = "warn";
  else level = "ok";
  return {
    id,
    ok: last ? last.ok : false,
    level,
    latencyMs: last ? last.latencyMs : null,
    checkedAt: last ? new Date(last.t).toISOString() : null,
    uptime24h,
    uptime7d: sumTotal > 0 ? sumOk / sumTotal : null,
    warn24h: windowTotal > 0 ? windowWarn / windowTotal : null,
    avgLatency24h: latencyCount > 0 ? latencySum / latencyCount : null,
    detail: last ? sampleReason(last) : null,
  };
}
