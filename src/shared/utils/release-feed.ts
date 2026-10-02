import type { ClosedReleaseEntry } from "@/shared/types";

export interface ReleaseRow {
  id: string;
  name: string;
  provider: string;
  date: string;
  ts: number;
  link: string | null;
}

function parseReleaseTs(value: string): number | null {
  const ts = Date.parse(value);
  return Number.isFinite(ts) ? ts : null;
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

export function buildClosedReleaseRows(closedReleases: ClosedReleaseEntry[]): ReleaseRow[] {
  return fromClosedReleases(closedReleases).sort((a, b) => b.ts - a.ts);
}

export const getReleaseRowId = (row: ReleaseRow) => row.id;
export const getReleaseSearchFields = (row: ReleaseRow) => [row.name, row.provider, row.id];
