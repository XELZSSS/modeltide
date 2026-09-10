import type { AppContext } from "@/server/context";
import { upstreamConfig } from "@/server/config";
import { fetchRscArrayLenient, fetchRscText } from "@/server/sources/rsc-fetch";

export async function fetchAaRsc(ctx: AppContext, path: string, retries = 1): Promise<string> {
  return fetchRscText(ctx, upstreamConfig.artificialAnalysis, path, { retries });
}

export async function fetchAndParseEnrich<T>(
  ctx: AppContext,
  label: string,
  path: string,
  marker: string,
  extract: (tree: unknown) => T[] | null,
  map?: (arr: T[]) => T[],
): Promise<T[]> {
  return fetchRscArrayLenient(ctx, upstreamConfig.artificialAnalysis, path, {
    label,
    marker,
    extract,
    map,
    logPrefix: "[artificial]",
    retries: 0,
  });
}
