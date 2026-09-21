import { shortModelId } from "@/client/utils/model-utils";
import type { ClosedReleaseEntry, OpenSourceModelEntry } from "@/shared/types";

/**
 * One release event in the feed. A release is just a release: rows carry who
 * published it and when, with no open/closed classification — the Hugging Face
 * side already covers open models and Artificial Analysis the rest.
 */
export interface ReleaseRow {
  id: string;
  name: string;
  provider: string;
  /** YYYY-MM-DD in UTC. */
  date: string;
  ts: number;
  link: string | null;
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

const HF_SOURCE = "Hugging Face";

function fromOpenSourceReleases(releases: OpenSourceModelEntry[]): ReleaseRow[] {
  const seen = new Map<string, ReleaseRow>();
  // Keyed by model + day: a same-day create/modify pair is one event now that
  // rows no longer carry a type label telling them apart.
  const add = (id: string, name: string, ts: number) => {
    const date = toReleaseDateStr(ts);
    const key = `${id}|${date}`;
    if (seen.has(key)) return;
    seen.set(key, {
      id: `hf:${id}@${date}`,
      name,
      provider: HF_SOURCE,
      date,
      ts,
      link: `https://huggingface.co/${id}`,
    });
  };
  for (const m of releases) {
    const name = shortModelId(m.id);
    if (m.createdAt) {
      const ts = parseReleaseTs(m.createdAt);
      if (ts != null) add(m.id, name, ts);
    }
    if (m.lastModified && m.lastModified !== m.createdAt) {
      const ts = parseReleaseTs(m.lastModified);
      if (ts != null) add(m.id, name, ts);
    }
  }
  return [...seen.values()];
}

function fromClosedReleases(releases: ClosedReleaseEntry[]): ReleaseRow[] {
  const rows: ReleaseRow[] = [];
  for (const e of releases) {
    const ts = parseReleaseTs(e.releaseDate);
    if (ts == null) continue;
    rows.push({
      id: `aa:${e.id}`,
      name: e.model,
      provider: e.provider,
      date: e.releaseDate.slice(0, 10),
      ts,
      link: e.link,
    });
  }
  return rows;
}

export function buildReleaseRows(
  openSourceReleases: OpenSourceModelEntry[],
  closedReleases: ClosedReleaseEntry[],
): ReleaseRow[] {
  return [...fromOpenSourceReleases(openSourceReleases), ...fromClosedReleases(closedReleases)].sort(
    (a, b) => b.ts - a.ts,
  );
}

export const getReleaseRowId = (row: ReleaseRow) => row.id;
// id keeps the source namespace (e.g. "hf:meta-llama/…"), so search still
// matches the org even though `name` is the bare model name.
export const getReleaseSearchFields = (row: ReleaseRow) => [row.name, row.provider, row.id];
