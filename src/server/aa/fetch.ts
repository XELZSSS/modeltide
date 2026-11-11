import type { AppContext } from "@/server/api/context";
import { upstreamConfig } from "@/server/upstream/upstream";
import { UpstreamError } from "@/server/api/errors";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import { defineSource, type FixedSource } from "@/server/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";
import { presentField, type AaRow } from "./wire";
import { projectFields } from "./parse/enrich-fields";
import { findLongestData } from "@/server/formats/rsc-data";
import { AA_FLIGHT_MARKERS } from "./markers";

export function fetchAaRsc(ctx: AppContext, path: string): Promise<string> {
  return ctx.http.getRsc(upstreamConfig.artificialAnalysis, path);
}

interface EnrichSpec {
  key: string;
  label: string;
  path: string;
  /** The fields this page serves: the same list is what `missingFields` warns about and what the rows are projected down to, as one value so the two cannot drift. */
  fields: readonly (keyof AaRow)[];
}
/** The enrichment pages and the leaderboard read their rows out of the same Flight marker, named once in `AA_FLIGHT_MARKERS`. `findLongestData` with no row gate suits a projection page, which carries one shape under the marker; the leaderboard's prop also bundles legend and changelog snapshots, so it recognizes rows through `isLeaderboardRow`. */
const ENRICH_MARKER = AA_FLIGHT_MARKERS.models;
const extractEnrichRows = (tree: unknown): AaRow[] | null => findLongestData<AaRow>(tree, ENRICH_MARKER);

function parseEnrich(spec: EnrichSpec, body: string): AaRow[] {
  const parsed = parseRscPayload<AaRow>(body, ENRICH_MARKER, extractEnrichRows);
  if (!parsed.ok) {
    throw new UpstreamError(`${spec.label} enrichment parse failed: ${parsed.error}`, { retryable: true });
  }
  // The projection runs on every row before anything reads them, so a row that is not an object is a parse failure here.
  return parsed.data.map(projectFields(spec.fields));
}

/**
 * Which expected fields no row carries, checked through `presentField` so the alias table stays the one definition of
 * "this field under any of its upstream spellings".
 */
function missingFields(rows: readonly AaRow[], fields: readonly (keyof AaRow)[]): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const field of fields) {
      if (seen.has(field)) continue;
      if (presentField(row, field) !== undefined) seen.add(field);
    }
    // Every expected field was seen at least once: no later row can change the answer.
    if (seen.size === fields.length) return [];
  }
  return fields.filter((field) => !seen.has(field));
}

/** One cached enrichment page, exposed through the same source interface as every other data source. */
export function defineEnrichSource(spec: EnrichSpec): FixedSource<AaRow[]> {
  return defineSource<string, AaRow[]>({
    key: spec.key,
    ttl: SLOW_TTL_MS,
    label: spec.label,
    fetch: (ctx) => fetchAaRsc(ctx, spec.path),
    parse: (body, ctx) => {
      const rows = parseEnrich(spec, body);
      const missing = missingFields(rows, spec.fields);
      if (missing.length > 0 && rows.length > 0) {
        ctx.log(
          "warn",
          `[artificial] ${spec.label} enrich omitted ${missing.length} expected field(s): ${missing.join(", ")}`,
        );
      }
      return rows;
    },
  });
}
