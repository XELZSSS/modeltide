import type { AppContext } from "@/server/context";
import { upstreamConfig } from "@/server/config";
import { errMsg } from "@/server/infra/task-pool";
import { parseRscPayload } from "@/server/parsers/rsc-parser";
import { fetchRscText } from "@/server/sources/rsc-fetcher";
import { cachedRaw } from "@/server/sources/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";

export async function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return fetchRscText(ctx, upstreamConfig.artificialAnalysis, path, { retries });
}

interface EnrichSpec<T> {
  label: string;
  path: string;
  marker: string;
  extract: (tree: unknown) => T[] | null;
  map?: (arr: T[]) => T[];
}

function fetchEnrichBody(ctx: AppContext, path: string): Promise<string> {
  return fetchRscText(ctx, upstreamConfig.artificialAnalysis, path, { retries: 0 });
}

interface EnrichResult<T> {
  rows: T[];
  /** Empty `rows` with `failed: false`: the payload is complete, not partial. */
  failed: boolean;
}

function parseEnrich<T>(ctx: AppContext, spec: EnrichSpec<T>, body: string): EnrichResult<T> {
  const parsed = parseRscPayload<T>(body, spec.marker, spec.extract);
  if (!parsed.ok) {
    ctx.log("warn", `[artificial] ${spec.label} enrichment parse failed: ${parsed.error}`);
    return { rows: [], failed: true };
  }
  return { rows: spec.map ? spec.map(parsed.data) : parsed.data, failed: false };
}

/** Only the fetch is cached: a failure writes nothing, so the next build retries it. */
export async function getAndParseEnrich<T>(
  ctx: AppContext,
  cacheKey: string,
  spec: EnrichSpec<T>,
): Promise<EnrichResult<T>> {
  let body: string;
  try {
    body = await cachedRaw<string>(ctx, cacheKey, SLOW_TTL_MS, () => fetchEnrichBody(ctx, spec.path));
  } catch (err) {
    ctx.log("warn", `[artificial] ${spec.label} enrichment failed: ${errMsg(err)}`);
    return { rows: [], failed: true };
  }
  return parseEnrich(ctx, spec, body);
}
