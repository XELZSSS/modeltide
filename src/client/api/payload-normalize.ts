import type { HomeDashboardData, HomeOpenSourceEntry } from "@/shared/types";
import { isPartialPayload } from "@/shared/types/payload";

function payloadData(payload: unknown, label: string): unknown {
  if (payload == null) throw new Error(`${label}: payload is null`);
  if (typeof payload === "object" && "data" in payload) return (payload as { data: unknown }).data;
  throw new Error(`${label}: invalid payload shape`);
}

export function unwrapList<T>(payload: unknown, label: string): T[] {
  const data = payloadData(payload, label);
  if (Array.isArray(data)) return data;
  throw new Error(`${label}: payload.data is not an array`);
}

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
    orRankings: raw.orRankings,
    textToImage: raw.textToImage,
    opensource: raw.opensource,
    partial: isPartialPayload(payload),
  };
}

export { isPartialPayload };

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

export function assertPayloadShape(malformed: boolean, label: string): void {
  if (malformed) throw new Error(`${label}: malformed payload`);
}
