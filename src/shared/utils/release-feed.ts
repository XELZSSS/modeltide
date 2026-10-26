import type { ClosedReleaseEntry } from "@/shared/types/rankings";

export interface ReleaseRow {
  id: string;
  name: string;
  provider: string;
  date: string;
  ts: number;
  link: string | null;
}

export function buildClosedReleaseRows(closedReleases: ClosedReleaseEntry[]): ReleaseRow[] {
  const rows: ReleaseRow[] = [];
  for (const e of closedReleases) {
    rows.push({
      id: `aa:${e.id}`,
      name: e.model,
      provider: e.provider,
      date: e.releaseDate.slice(0, 10),
      ts: Date.parse(e.releaseDate),
      link: e.link,
    });
  }
  return rows.sort((a, b) => b.ts - a.ts);
}

export const getReleaseRowId = (row: ReleaseRow) => row.id;
export const getReleaseSearchFields = (row: ReleaseRow) => [row.name, row.provider, row.id];
