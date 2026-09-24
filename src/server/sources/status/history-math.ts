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

const SAMPLE_UPSERT_WINDOW_MS = 4 * ONE_MINUTE;
const RECENT_WINDOW_MS = ONE_DAY;
const RETAINED_DAYS = 30;

const utcDay = (t: number): string => new Date(t).toISOString().slice(0, 10);

function samplesInWindow(samples: UptimeSample[], windowStartMs: number): UptimeSample[] {
  return samples.filter((s) => s.t >= windowStartMs);
}

function uptimeRatio(samples: UptimeSample[], windowStartMs: number): number | null {
  const inWindow = samplesInWindow(samples, windowStartMs);
  if (inWindow.length === 0) return null;
  return inWindow.filter((s) => s.ok).length / inWindow.length;
}

function avgLatency(samples: UptimeSample[], windowStartMs: number): number | null {
  const values = samplesInWindow(samples, windowStartMs)
    .filter((s) => s.ok && s.latencyMs != null)
    .map((s) => s.latencyMs!);
  if (values.length === 0) return null;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

type IncidentType = "down" | "degraded";

interface OpenIncident {
  type: IncidentType;
  at: number;
  index: number;
}

function incidentType(sample: UptimeSample): IncidentType | null {
  if (!sample.ok) return "down";
  return sample.warn === true ? "degraded" : null;
}

function sampleReason(sample: UptimeSample): string | null {
  if (!sample.ok) return sample.error ?? null;
  if (sample.warn === true) return sample.warnReason ?? null;
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
    if (open && open.type !== want) close(sample.t, want === null || (open.type === "down" && want === "degraded"));
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

function applySampleDelta(bucket: DayBucket, sample: UptimeSample, dir: 1 | -1): void {
  bucket.total = Math.max(0, bucket.total + dir);
  if (sample.ok) {
    bucket.ok = Math.max(0, bucket.ok + dir);
  }
  if (sample.warn === true) {
    bucket.warn = Math.max(0, (bucket.warn ?? 0) + dir);
  }
}

function pruneWindows(entry: HistorySourceEntry, now: number): HistorySourceEntry {
  const cutoffDay = utcDay(now - RETAINED_DAYS * ONE_DAY);
  return {
    recent: entry.recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
    daily: entry.daily.filter((b) => b.day >= cutoffDay).slice(-RETAINED_DAYS),
    openSince: entry.openSince,
  };
}

function rollbackLastSample(daily: DayBucket[], last: UptimeSample): void {
  const lastBucket = daily.find((b) => b.day === utcDay(last.t));
  if (lastBucket) applySampleDelta(lastBucket, last, -1);
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

  return pruneWindows({ recent, daily, openSince: nextOpenSince(prevEntry, last, sample, now) }, now);
}

export function buildSourceSummary(id: SourceId, entry: HistorySourceEntry, now: number): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  const buckets = entry.daily.slice(-7);
  const sumOk = buckets.reduce((a, b) => a + b.ok, 0);
  const sumTotal = buckets.reduce((a, b) => a + b.total, 0);
  const uptime24h = uptimeRatio(entry.recent, now - RECENT_WINDOW_MS);
  const inWindow = samplesInWindow(entry.recent, now - RECENT_WINDOW_MS);
  const degradedInWindow = inWindow.filter((s) => s.warn === true).length;
  let level: SourceHealthLevel;
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
    degraded24h: inWindow.length > 0 ? degradedInWindow / inWindow.length : null,
    avgLatency24h: avgLatency(entry.recent, now - RECENT_WINDOW_MS),
    detail: last ? sampleReason(last) : null,
  };
}
