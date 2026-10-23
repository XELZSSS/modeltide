import type { AppContext } from "@/server/api/context";
import { upstreamConfig } from "@/server/upstream/upstream";
import { UpstreamError } from "@/server/api/errors";
import { isRecord } from "@/server/formats/scalars";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import { defineSource, type FixedSource } from "@/server/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";
import { fieldAliases } from "./parse/benchmark-fields";

export function fetchAaRsc(ctx: AppContext, path: string): Promise<string> {
  return ctx.http.getRsc(upstreamConfig.artificialAnalysis, path);
}

interface EnrichSpec<T> {
  key: string;
  label: string;
  path: string;
  marker: string;
  extract: (tree: unknown) => T[] | null;
  fields?: readonly string[];
  map?: (arr: T[]) => T[];
}

function parseEnrich<T>(spec: EnrichSpec<T>, body: string): T[] {
  const parsed = parseRscPayload<T>(body, spec.marker, spec.extract);
  if (!parsed.ok) {
    throw new UpstreamError(`${spec.label} enrichment parse failed: ${parsed.error}`, { retryable: true });
  }
  return spec.map ? spec.map(parsed.data) : parsed.data;
}

function missingFields<T>(rows: readonly T[], fields: readonly string[]): readonly string[] {
  const seen = new Set<string>();
  for (const row of rows) {
    if (!isRecord(row)) continue;
    for (const field of fields) {
      for (const alias of fieldAliases(field)) {
        if (alias in row) {
          seen.add(field);
          break;
        }
      }
    }
  }
  return fields.filter((field) => !seen.has(field));
}

/** One cached enrichment page, exposed through the same source interface as every other data source. */
export function defineEnrichSource<T>(spec: EnrichSpec<T>): FixedSource<T[]> {
  return defineSource<string, T[]>({
    key: spec.key,
    ttl: SLOW_TTL_MS,
    label: spec.label,
    fetch: (ctx) => fetchAaRsc(ctx, spec.path),
    parse: (body, ctx) => {
      const rows = parseEnrich(spec, body);
      if (spec.fields) {
        const missing = missingFields(rows, spec.fields);
        if (missing.length > 0 && rows.length > 0) {
          ctx.log(
            "warn",
            `[artificial] ${spec.label} enrich omitted ${missing.length} expected field(s): ${missing.join(", ")}`,
          );
        }
      }
      return rows;
    },
  });
}
