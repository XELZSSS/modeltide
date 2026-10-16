import type { ClosedReleaseEntry } from "@/shared/types/rankings";

export interface ReleaseRow {
  id: string;
  name: string;
  provider: string;
  date: string;
  ts: number;
  link: string | null;
}

// releaseDate is "YYYY-MM-DD" (server releases/parse.ts forces isoDate before
// persisting), and date-only ISO strings always parse to a finite timestamp.
function fromClosedReleases(releases: ClosedReleaseEntry[]): ReleaseRow[] {
  const rows: ReleaseRow[] = [];
  for (const e of releases) {
    rows.push({
      id: `aa:${e.id}`,
      name: e.model,
      provider: e.provider,
      date: e.releaseDate.slice(0, 10),
      ts: Date.parse(e.releaseDate),
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
