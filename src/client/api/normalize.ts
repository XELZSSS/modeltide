"use client";
import type { HomeDashboardData, OpenSourceModelEntry, SourcePayload } from "@/shared/types";

/**
 * Runtime guard for SourcePayload<T[]>. Strict: only accepts the canonical
 * shape `{data: T[], fetchedAt: string, partial?: boolean}`. Malformed
 * payloads throw — ErrorBoundary handles it instead of letting `.filter`
 * crash deep in the table layer.
 *
 * The shape is generation-locked to the code that produced it (server cache
 * entries are hard-cut per CACHE_VERSION, never migrated), so no cross-shape
 * tolerance is needed. Any future drift fails loudly at the API boundary,
 * not inside `dedupeBy`/`filterByTerm`.
 */
export function unwrapList<T>(payload: unknown, label: string): T[] {
  if (payload == null) throw new Error(`${label}: payload is null`);
  if (typeof payload === "object" && "data" in payload) {
    const data = (payload as SourcePayload<T[]>).data;
    if (Array.isArray(data)) return data;
    throw new Error(`${label}: payload.data is not an array`);
  }
  throw new Error(`${label}: invalid payload shape`);
}

export interface NormalizedHomeDashboard {
  orRankings: HomeDashboardData["orRankings"];
  textToImage: HomeDashboardData["textToImage"];
  opensource: OpenSourceModelEntry[];
  /** True when any dashboard leg failed and was nulled out. */
  partial: boolean;
}

export function normalizeHomeDashboard(raw: HomeDashboardData, label = "homeDashboard"): NormalizedHomeDashboard {
  if (!raw || typeof raw !== "object") throw new Error(`${label}: invalid dashboard`);
  const orRankings = raw.orRankings ?? null;
  const textToImage = raw.textToImage ?? null;
  const opensourceRaw = raw.opensource as unknown;
  const opensourceMissing = opensourceRaw == null;
  let opensource: NormalizedHomeDashboard["opensource"];
  if (opensourceMissing) opensource = [] as unknown as NormalizedHomeDashboard["opensource"];
  else if (
    typeof opensourceRaw === "object" &&
    "data" in opensourceRaw &&
    Array.isArray((opensourceRaw as SourcePayload<unknown[]>).data)
  ) {
    opensource = (opensourceRaw as SourcePayload<NormalizedHomeDashboard["opensource"]>).data;
  } else {
    throw new Error(`${label}.opensource: invalid shape`);
  }
  const partial = orRankings == null || textToImage == null || opensourceMissing;
  return { orRankings, textToImage, opensource, partial };
}

/** Non-throwing variant of unwrapList that also surfaces the payload partial flag. */
export function unwrapListPartial<T>(payload: unknown, label: string): { data: T[]; partial: boolean } {
  const partial =
    typeof payload === "object" && payload != null && "partial" in payload
      ? (payload as SourcePayload<T[]>).partial === true
      : false;
  if (payload == null) return { data: [] as T[], partial };
  try {
    return { data: unwrapList<T>(payload, label), partial };
  } catch (err) {
    console.warn(`[api] dropping malformed ${label} payload:`, err);
    return { data: [] as T[], partial };
  }
}
