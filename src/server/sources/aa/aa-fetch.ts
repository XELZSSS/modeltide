import type { AppContext } from "@/server/context";
import { UPSTREAM_FETCH_OPTS, upstreamConfig } from "@/server/config";
import { ClientAbortError, UpstreamError } from "@/server/infra/errors";
import { logPartial } from "@/server/infra/logger";
import { parseRscPayload } from "@/server/parsers/rsc-parser";
import { cachedRaw } from "@/server/sources/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";

export function fetchAaRsc(
  ctx: AppContext,
  path: string,
  retries: number = UPSTREAM_FETCH_OPTS.retries,
): Promise<string> {
  void retries;
  return ctx.http.getRsc(upstreamConfig.artificialAnalysis, path);
}

interface EnrichSpec<T> {
  label: string;
  path: string;
  marker: string;
  extract: (tree: unknown) => T[] | null;
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

export async function getAndParseEnrich<T>(
  ctx: AppContext,
  cacheKey: string,
  spec: EnrichSpec<T>,
): Promise<EnrichResult<T>> {
  try {
    const { value, degraded } = await cachedRaw<T[]>(ctx, cacheKey, SLOW_TTL_MS, async (refreshCtx) => {
      const body = await fetchAaRsc(refreshCtx, spec.path);
      return parseEnrich(spec, body);
    });
    return { rows: value, failed: degraded };
  } catch (err) {
    if (err instanceof ClientAbortError) throw err;
    logPartial(ctx.log, "artificial", { label: spec.label, failed: true });
    return { rows: [], failed: true };
  }
}
