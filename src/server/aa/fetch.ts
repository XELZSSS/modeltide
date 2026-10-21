import type { AppContext } from "@/server/api/context";
import { upstreamConfig } from "@/server/upstream/upstream";
import { ClientAbortError, UpstreamError } from "@/server/api/errors";
import { isRecord } from "@/server/formats/parser-primitives";
import { parseRscPayload } from "@/server/formats/rsc-parser";
import { cachedRaw } from "@/server/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";
import { fieldAliases } from "./parse/model-compact";

export function fetchAaRsc(ctx: AppContext, path: string): Promise<string> {
  return ctx.http.getRsc(upstreamConfig.artificialAnalysis, path);
}

interface EnrichSpec<T> {
  label: string;
  path: string;
  marker: string;
  extract: (tree: unknown) => T[] | null;
  /** Audited inside the refresh closure: a cache hit returns already-mapped rows. */
  fields?: readonly string[];
  map?: (arr: T[]) => T[];
}

interface EnrichResult<T> {
  rows: T[];
  failed: boolean;
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

export async function getAndParseEnrich<T>(
  ctx: AppContext,
  cacheKey: string,
  spec: EnrichSpec<T>,
): Promise<EnrichResult<T>> {
  try {
    const { value, degraded } = await cachedRaw<T[]>(ctx, cacheKey, SLOW_TTL_MS, async (refreshCtx) => {
      const rows = parseEnrich(spec, await fetchAaRsc(refreshCtx, spec.path));
      if (spec.fields) {
        const missing = missingFields(rows, spec.fields);
        if (missing.length > 0 && rows.length > 0) {
          refreshCtx.log(
            "warn",
            `[artificial] ${spec.label} enrich omitted ${missing.length} expected field(s): ${missing.join(", ")}`,
          );
        }
      }
      return rows;
    });
    return { rows: value, failed: degraded };
  } catch (err) {
    if (err instanceof ClientAbortError) throw err;
    ctx.log("warn", "[artificial] partial", { label: spec.label, failed: true });
    return { rows: [], failed: true };
  }
}
