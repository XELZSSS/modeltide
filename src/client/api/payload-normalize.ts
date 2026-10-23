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

function unwrapObject<T>(payload: unknown, label: string): T {
  return payloadData(payload, label) as T;
}

export interface NormalizedHomeDashboard {
  orRankings: HomeDashboardData["orRankings"];
  textToImage: HomeDashboardData["textToImage"];
  opensource: HomeOpenSourceEntry[];
  chart: HomeDashboardData["chart"];
  providers: HomeDashboardData["providers"];
  hallucinations: HomeDashboardData["hallucinations"];
  partial: boolean;
  malformed: boolean;
}

function listField<T>(value: unknown): T[] | null {
  return Array.isArray(value) ? (value as T[]) : null;
}

export function normalizeHomeDashboard(payload: unknown): NormalizedHomeDashboard {
  const label = "homeDashboard";
  let raw: HomeDashboardData | null = null;
  try {
    raw = unwrapObject<HomeDashboardData>(payload, label);
    if (raw == null || typeof raw !== "object") raw = null;
  } catch (err) {
    console.warn(`[api] dropping malformed ${label} payload:`, err);
  }
  const orRankings = raw ? listField<HomeDashboardData["orRankings"][number]>(raw.orRankings) : null;
  const textToImage = raw ? listField<HomeDashboardData["textToImage"][number]>(raw.textToImage) : null;
  const opensource = raw ? listField<HomeOpenSourceEntry>(raw.opensource) : null;
  const chart = raw ? listField<HomeDashboardData["chart"][number]>(raw.chart) : null;
  const providers = raw ? listField<HomeDashboardData["providers"][number]>(raw.providers) : null;
  const hallucinations = raw ? listField<HomeDashboardData["hallucinations"][number]>(raw.hallucinations) : null;
  return {
    orRankings: orRankings ?? [],
    textToImage: textToImage ?? [],
    opensource: opensource ?? [],
    chart: chart ?? [],
    providers: providers ?? [],
    hallucinations: hallucinations ?? [],
    partial: isPartialPayload(payload),
    malformed:
      raw == null ||
      orRankings == null ||
      textToImage == null ||
      opensource == null ||
      chart == null ||
      providers == null ||
      hallucinations == null,
  };
}

export { isPartialPayload };

export function unwrapListPartial<T>(
  payload: unknown,
  label: string,
): { data: T[]; partial: boolean; malformed: boolean } {
  if (payload === undefined) return { data: [] as T[], partial: false, malformed: false };
  const partial = isPartialPayload(payload);
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
