import { API_DOMAINS, SOURCE_IDS } from "@/shared/config";
import { isRecord } from "@/server/parsers/parser-primitives";
import type { SourceId, UptimeSample } from "@/shared/types";

export const HISTORY_SCHEMA_VERSION = 3;

const PREVIOUS_SCHEMA_VERSION = 2;

export const HISTORY_KEY = API_DOMAINS.statusHistory;

export const FIRST_LAUNCH_KEY = "uptime:first-launch";

export const SAMPLE_LOCK_KEY = `${API_DOMAINS.statusHistory}:lock`;

export interface HistorySourceEntry {
  recent: UptimeSample[];
  openSince: number | null;
}

export interface HistoryStore {
  sources: Partial<Record<SourceId, HistorySourceEntry>>;
}

export const emptyEntry = (): HistorySourceEntry => ({ recent: [], openSince: null });

function isNonNegativeNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isNonNegativeInteger(value: unknown): value is number {
  return isNonNegativeNumber(value) && Number.isSafeInteger(value);
}

function isValidHttpStatus(value: unknown): value is number {
  return isNonNegativeInteger(value) && value >= 100 && value <= 599;
}

function isValidSample(s: unknown): s is UptimeSample {
  if (!isRecord(s)) return false;
  if (!isNonNegativeInteger(s.t) || s.t <= 0 || typeof s.ok !== "boolean") return false;
  if (s.latencyMs !== null && !isNonNegativeNumber(s.latencyMs)) return false;
  if (s.status !== null && !isValidHttpStatus(s.status)) return false;
  if (s.error !== null && typeof s.error !== "string") return false;
  if (typeof s.warn !== "boolean") return false;
  if (s.warn && !s.ok) return false;
  if (s.warnReason !== null && typeof s.warnReason !== "string") return false;
  return true;
}

function isValidOpenSince(value: unknown): value is number | null {
  return value === null || (isNonNegativeInteger(value) && value > 0);
}

export function salvageStore(parsed: unknown): HistoryStore | null {
  if (!isRecord(parsed)) return null;
  // v2 blobs carry an unread daily bucket map; keep their samples, drop the buckets.
  if (parsed.v !== HISTORY_SCHEMA_VERSION && parsed.v !== PREVIOUS_SCHEMA_VERSION) return null;
  const { sources } = parsed;
  if (!isRecord(sources)) return null;
  const out: HistoryStore["sources"] = {};
  for (const id of SOURCE_IDS) {
    const entry = sources[id];
    if (!isRecord(entry)) continue;
    const recent = (Array.isArray(entry.recent) ? entry.recent.filter(isValidSample) : []).sort((a, b) => a.t - b.t);
    if (recent.length === 0) continue;
    out[id] = { recent, openSince: isValidOpenSince(entry.openSince) ? entry.openSince : null };
  }
  return Object.keys(out).length > 0 ? { sources: out } : null;
}
