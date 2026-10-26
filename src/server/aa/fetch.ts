import type { AppContext } from "@/server/api/context";
import { upstreamConfig } from "@/server/upstream/upstream";
import { UpstreamError } from "@/server/api/errors";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import { defineSource, type FixedSource } from "@/server/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";
import { fieldAliases } from "./parse/benchmark-fields";
import { projectFields } from "./parse/enrich-fields";
import { findNextData } from "@/server/formats/rsc-data";
import { AA_FLIGHT_MARKERS } from "./markers";

export function fetchAaRsc(ctx: AppContext, path: string): Promise<string> {
  return ctx.http.getRsc(upstreamConfig.artificialAnalysis, path);
}

type EnrichRow = Record<string, unknown>;

interface EnrichSpec {
  key: string;
  label: string;
  path: string;
  /**
   * The fields this page serves. The same list is what `missingFields` warns about and what the rows are projected
   * down to — as one value, because two lists that had to agree could only drift into a warning about a field the row
   * keeps, or a row keeping a field nobody checks.
   */
  fields: readonly string[];
}
/**
 * Both AA pages carry their rows under the same Flight marker, which `AA_FLIGHT_MARKERS` names once for this parser and
 * for the leaderboard parser — the two cannot disagree about which prop to read.
 */
const ENRICH_MARKER = AA_FLIGHT_MARKERS.models;
const extractEnrichRows = (tree: unknown): EnrichRow[] | null => findNextData<EnrichRow>(tree, ENRICH_MARKER);

function parseEnrich(spec: EnrichSpec, body: string): EnrichRow[] {
  const parsed = parseRscPayload<EnrichRow>(body, ENRICH_MARKER, extractEnrichRows);
  if (!parsed.ok) {
    throw new UpstreamError(`${spec.label} enrichment parse failed: ${parsed.error}`, { retryable: true });
  }
  // The projection runs on every row before anything reads them, so a row that is not an object is already a parse
  // failure here rather than an empty field below.
  return parsed.data.map(projectFields(spec.fields));
}

function missingFields(rows: readonly EnrichRow[], fields: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    for (const field of fields) {
      if (seen.has(field)) continue;
      for (const alias of fieldAliases(field)) {
        if (alias in row) {
          seen.add(field);
          break;
        }
      }
    }
    // Every expected field was seen at least once: no later row can change the answer.
    if (seen.size === fields.length) return [];
  }
  return fields.filter((field) => !seen.has(field));
}

/** One cached enrichment page, exposed through the same source interface as every other data source. */
export function defineEnrichSource(spec: EnrichSpec): FixedSource<EnrichRow[]> {
  return defineSource<string, EnrichRow[]>({
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
