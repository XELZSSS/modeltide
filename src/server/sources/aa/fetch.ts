import type { AppContext } from "@/server/context";
import { UPSTREAM_FETCH_OPTS, upstreamConfig } from "@/server/config";
import { findNextData, parseRscPayload } from "@/server/parsers/rsc";
import { isNonEmptyString } from "@/server/sources/data-filter";
import { errMsg } from "@/server/infra/pool";

export const RSC_HEADERS = { RSC: "1", "Next-Router-State-Tree": "%5B%5D" } as const;

export const INDEX_PATH = "/evaluations/artificial-analysis-intelligence-index";
export const MODELS_PATH = "/models";
export const OMNISCIENCE_PATH = "/evaluations/omniscience";

export async function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return ctx.http.text(`${upstreamConfig.artificialAnalysis}${path}`, {
    headers: { ...RSC_HEADERS },
    retries,
    timeoutMs: UPSTREAM_FETCH_OPTS.timeoutMs,
  });
}

function isModelArray(arr: unknown): arr is Record<string, unknown>[] {
  return (
    Array.isArray(arr) &&
    arr.length >= 1 &&
    arr.some((m) => m && typeof m === "object" && isNonEmptyString((m as { slug?: unknown }).slug))
  );
}

export function findModelArray(tree: unknown): Record<string, unknown>[] | null {
  const candidates = [
    findNextData<Record<string, unknown>>(tree, "initialModels"),
    findNextData<Record<string, unknown>>(tree, "models"),
  ];
  for (const arr of candidates) {
    if (arr?.some((m) => m && typeof m === "object" && "intelligenceIndex" in m)) return arr;
  }
  for (const arr of candidates) {
    if (isModelArray(arr)) return arr;
  }
  return null;
}

export async function fetchAndParseEnrich<T>(
  ctx: AppContext,
  label: string,
  path: string,
  marker: string,
  extract: (tree: unknown) => T[] | null,
  map?: (arr: T[]) => T[],
): Promise<T[]> {
  let body: string | null;
  try {
    body = await fetchAaRsc(ctx, path, 0);
  } catch (err) {
    ctx.log("warn", `[artificial] ${label} enrichment failed: ${errMsg(err)}`);
    return [];
  }
  try {
    const arr = parseRscPayload<T>(body, marker, extract);
    return map ? map(arr) : arr;
  } catch (err) {
    ctx.log("warn", `[artificial] ${label} enrichment parse failed: ${errMsg(err)}`);
    return [];
  }
}
