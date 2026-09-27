import type { AppContext } from "@/server/context";
import { upstreamConfig } from "@/server/config";
import { UpstreamError } from "@/server/infra/errors";
import { errMsg } from "@/server/infra/task-pool";
import { parseRscPayload } from "@/server/parsers/rsc-parser";
import { fetchRscText } from "@/server/sources/rsc-fetcher";
import { cachedRaw } from "@/server/sources/pipeline";
import { SLOW_TTL_MS } from "@/shared/config";

export function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return fetchRscText(ctx, upstreamConfig.artificialAnalysis, path, { retries });
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
    const rows = await cachedRaw<T[]>(ctx, cacheKey, SLOW_TTL_MS, async (refreshCtx) => {
      const body = await fetchAaRsc(refreshCtx, spec.path, 0);
      return parseEnrich(spec, body);
    });
    return { rows, failed: false };
  } catch (err) {
    ctx.log("warn", `[artificial] ${spec.label} enrichment failed: ${errMsg(err)}`);
    return { rows: [], failed: true };
  }
}
