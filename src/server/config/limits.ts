import { MAX_MODEL_LIMIT } from "@/shared/config/limits";

export const SOURCE_LIMITS = {
  openRouterRankingModels: 1000,
  aaIndexModels: 300,
  closedReleases: 500,
  agentRankings: 100,
  newsPerCategory: 30,
  dailyPapers: 20,
  hfPapersQuota: 5,
  feedItemsPerFeed: 30,
} as const;

export const PER_MILLION = 1_000_000;

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
