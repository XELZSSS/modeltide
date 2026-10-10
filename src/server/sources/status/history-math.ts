import { ONE_DAY, ONE_MINUTE } from "@/shared/config";
import type { SourceHealthLevel, SourceHistorySummary, SourceId, StatusEvent, UptimeSample } from "@/shared/types";
import { emptyEntry, type HistorySourceEntry } from "./schema";

const RECENT_WINDOW_MS = ONE_DAY;

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

function pruneRecent(entry: HistorySourceEntry, now: number): HistorySourceEntry {
  return {
    recent: entry.recent.filter((s) => s.t > now - RECENT_WINDOW_MS),
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

  return pruneRecent({ recent, openSince: nextOpenSince(prevEntry, last, sample, now) }, now);
}

export function buildSourceSummary(id: SourceId, entry: HistorySourceEntry): SourceHistorySummary {
  const last = entry.recent[entry.recent.length - 1];
  let level: SourceHealthLevel;
  if (!last) level = "unknown";
  else if (!last.ok) level = "error";
  else if (last.warn) level = "warn";
  else level = "ok";
  return {
    id,
    ok: last ? last.ok : false,
    level,
    latencyMs: last ? last.latencyMs : null,
    checkedAt: last ? new Date(last.t).toISOString() : null,
    detail: last ? sampleReason(last) : null,
  };
}
