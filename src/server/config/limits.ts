import { MAX_MODEL_LIMIT, OPEN_SOURCE_MODELS_DEFAULTS } from "@/shared/config/limits";

/** Fetch caps per content: unbounded upstreams are windowed to a recent head (HF models/releases),
 * detail-backed lists stay uncapped because truncating them loses content. */
export const SOURCE_LIMITS = {
  // Tied to the shared default page size: cap and default request limit must agree or a default
  // request would be truncated server-side.
  openSourceModels: OPEN_SOURCE_MODELS_DEFAULTS.limit,
  openSourceReleases: 200,
  agentRankings: 100,
  newsPerCategory: 30,
  dailyPapers: 20,
  /** Guaranteed seats for HF daily papers at the head of the research feed. */
  hfPapersQuota: 5,
  feedItemsPerFeed: 30,
} as const;

export const PER_MILLION = 1_000_000;

/** Upstream rates are quoted per token; payloads carry dollars per million. */
export function perMillionOrNull(rate: number | null): number | null {
  return rate == null ? null : rate * PER_MILLION;
}

export function normalizeModelLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 50) return 50;
  if (limit <= 100) return 100;
  if (limit <= 200) return 200;
  return MAX_MODEL_LIMIT;
}

export function sliceToLimit<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, Math.max(0, Math.min(limit, MAX_MODEL_LIMIT)));
}
