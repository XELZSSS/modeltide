import type { HomeDashboardData, HomeOpenSourceEntry } from "@/shared/types";
import { isPartialPayload } from "@/shared/types/payload";
import { malformedPayload } from "../transport/error";

function payloadData(payload: unknown, label: string): unknown {
  if (payload == null) throw new Error(`${label}: payload is null`);
  if (typeof payload === "object" && "data" in payload) return (payload as { data: unknown }).data;
  throw new Error(`${label}: invalid payload shape`);
}

function unwrapList<T>(payload: unknown, label: string): T[] {
  const data = payloadData(payload, label);
  if (Array.isArray(data)) return data;
  throw new Error(`${label}: payload.data is not an array`);
}

function unwrapObject<T>(payload: unknown, label: string): T {
  return payloadData(payload, label) as T;
}

export interface NormalizedHomeDashboard {
  textToImage: HomeDashboardData["textToImage"];
  opensource: HomeOpenSourceEntry[];
  openSourceTasks: HomeDashboardData["openSourceTasks"];
  chart: HomeDashboardData["chart"];
  providers: HomeDashboardData["providers"];
  hallucinations: HomeDashboardData["hallucinations"];
  partial: boolean;
  malformed: boolean;
}

const LIST_FIELDS = [
  "textToImage",
  "opensource",
  "openSourceTasks",
  "chart",
  "providers",
  "hallucinations",
] as const satisfies readonly (keyof HomeDashboardData)[];

type HomeListField = (typeof LIST_FIELDS)[number];

/**
 * The envelope has already been validated by `payloadData`; each list field is read as its declared type and a
 * missing or wrongly-typed one degrades to `[]` while `malformed` records it, so one bad field cannot blank the
 * dashboard the other five still fill.
 */
export function normalizeHomeDashboard(payload: unknown): NormalizedHomeDashboard {
  const label = "homeDashboard";
  let raw: HomeDashboardData | null = null;
  try {
    raw = unwrapObject<HomeDashboardData>(payload, label);
  } catch (err) {
    console.warn(`[api] dropping malformed ${label} payload:`, err);
  }
  const lists = {} as Record<HomeListField, unknown[]>;
  let malformed = raw == null;
  for (const field of LIST_FIELDS) {
    const value = raw?.[field];
    if (Array.isArray(value)) lists[field] = value;
    else {
      lists[field] = [];
      malformed = true;
    }
  }
  return {
    ...(lists as unknown as Pick<NormalizedHomeDashboard, HomeListField>),
    partial: isPartialPayload(payload),
    malformed,
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
  if (malformed) throw malformedPayload(`${label}: malformed payload`);
}
