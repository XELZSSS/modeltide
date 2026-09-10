import { shortModelId } from "@/client/utils/model";
import type { OpenSourceModelEntry } from "@/shared/types";

export type FeedEntryType = "update" | "opensource";

export interface FeedEntry {
  id: string;
  name: string;
  date: string;
  ts: number;
  type: FeedEntryType;
}

export function parseReleaseTs(value: string): number | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
}

function toReleaseDateStr(ts: number): string {
  const d = new Date(ts);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function buildReleaseFeedEntries(openSourceReleases: OpenSourceModelEntry[]): FeedEntry[] {
  const seen = new Map<string, FeedEntry>();
  const add = (id: string, name: string, ts: number, type: FeedEntry["type"]) => {
    const key = `${id}|${type}|${ts}`;
    if (!seen.has(key)) seen.set(key, { id, name, date: toReleaseDateStr(ts), ts, type });
  };
  for (const m of openSourceReleases) {
    const name = shortModelId(m.id);
    if (m.createdAt) {
      const ts = parseReleaseTs(m.createdAt);
      if (ts != null) add(m.id, name, ts, "opensource");
    }
    if (m.lastModified && m.lastModified !== m.createdAt) {
      const ts = parseReleaseTs(m.lastModified);
      if (ts != null) add(`${m.id}_mod`, name, ts, "update");
    }
  }
  return Array.from(seen.values()).sort((a, b) => b.ts - a.ts);
}

export const getFeedSearchFields = (e: FeedEntry) => [e.name, e.id];
export const getFeedRowId = (e: FeedEntry) => e.id;
