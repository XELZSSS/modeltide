import type { HomeDashboardData, HomeOpenSourceEntry } from "@/shared/types";
import { isPartialDashboard } from "@/shared/utils";

function payloadData(payload: unknown, label: string): unknown {
  if (payload == null) throw new Error(`${label}: payload is null`);
  if (typeof payload === "object" && "data" in payload) return (payload as { data: unknown }).data;
  throw new Error(`${label}: invalid payload shape`);
}

/** No cross-shape tolerance: server cache entries are hard-cut per CACHE_VERSION and never migrated. */
export function unwrapList<T>(payload: unknown, label: string): T[] {
  const data = payloadData(payload, label);
  if (Array.isArray(data)) return data;
  throw new Error(`${label}: payload.data is not an array`);
}

/** `data` carries the whole object, null for a model that does not exist. */
export function unwrapObject<T>(payload: unknown, label: string): T {
  return payloadData(payload, label) as T;
}

export interface NormalizedHomeDashboard {
  orRankings: HomeDashboardData["orRankings"];
  textToImage: HomeDashboardData["textToImage"];
  opensource: HomeOpenSourceEntry[];
  partial: boolean;
}

export function normalizeHomeDashboard(payload: unknown, label = "homeDashboard"): NormalizedHomeDashboard {
  const raw = unwrapObject<HomeDashboardData>(payload, label);
  if (!raw || typeof raw !== "object") throw new Error(`${label}: invalid dashboard`);
  return {
    orRankings: raw.orRankings ?? null,
    textToImage: raw.textToImage ?? null,
    opensource: raw.opensource ?? [],
    partial: isPartialDashboard(raw),
  };
}

export function isPartialPayload(payload: unknown): boolean {
  return (payload as { partial?: boolean } | null | undefined)?.partial === true;
}

export function unwrapListPartial<T>(
  payload: unknown,
  label: string,
): { data: T[]; partial: boolean; malformed: boolean } {
  const partial = isPartialPayload(payload);
  if (payload == null) return { data: [] as T[], partial, malformed: false };
  try {
    return { data: unwrapList<T>(payload, label), partial, malformed: false };
  } catch (err) {
    console.warn(`[api] dropping malformed ${label} payload:`, err);
    return { data: [] as T[], partial, malformed: true };
  }
}
