import { STATIC_TTL_MS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra";
import {
  getChangelogModels,
  getIntelligenceIndex,
  type ChangelogModel,
} from "@/server/sources/artificial-analysis";
import { dedupeBy } from "@/shared/utils";

interface CreatorRule {
  /** Release matches when `include` hits (default: every release of the creator). */
  include?: RegExp;
  /** `exclude` always wins (open-weights product lines of mixed vendors). */
  exclude?: RegExp;
}

/**
 * Curated closed-vendor rules for changelog history, which carries no
 * open-weights flag. Fail-closed: creators absent here never list (the long
 * tail is open-research labs). `haystack` is "<releaseSlug> <releaseName>".
 */
export const CLOSED_CREATOR_RULES: Record<string, CreatorRule> = {
  OpenAI: {},
  Anthropic: {},
  Amazon: {},
  Baidu: {},
  Google: { exclude: /gemma/i },
  SpaceXAI: { exclude: /^grok-1\b/i },
  Meta: { exclude: /^llama[\s-]/i },
  Mistral: {
    include: /(large|medium|magistral)/i,
    exclude: /(small|ministral|mixtral|codestral|devstral)/i,
  },
  Upstage: { include: /solar pro/i },
  Perplexity: { exclude: /1776/i },
};

export function matchesClosedRule(creatorName: string, haystack: string): boolean {
  const rule = CLOSED_CREATOR_RULES[creatorName];
  if (!rule) return false;
  if (rule.exclude?.test(haystack)) return false;
  if (rule.include && !rule.include.test(haystack)) return false;
  return true;
}

/** Exact weights keyed by model slug (and id when it differs). */
export function buildWeightsIndex(models: ArtificialAnalysisModel[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const m of models) {
    if (typeof m.is_open_weights !== "boolean") continue;
    if (m.slug) map.set(m.slug, m.is_open_weights);
    if (m.id && m.id !== m.slug) map.set(m.id, m.is_open_weights);
  }
  return map;
}

/**
 * Closed iff exactly flagged closed in the index, else iff the curated
 * creator rule matches. Unknown creators fail closed (excluded).
 */
export function isClosedChangelogRelease(e: ChangelogModel, weights: Map<string, boolean>): boolean {
  const exact = weights.get(e.slug) ?? weights.get(e.releaseSlug);
  if (exact === false) return true;
  if (exact === true) return false;
  return matchesClosedRule(e.creatorName, `${e.releaseSlug} ${e.releaseName}`);
}

function toClosedRelease(e: ChangelogModel): ClosedReleaseEntry {
  const releaseDate = e.releaseDate.length > 10 ? e.releaseDate.slice(0, 10) : e.releaseDate;
  return {
    id: e.releaseSlug,
    model: e.releaseName,
    provider: e.creatorName,
    releaseDate,
    notes: "",
    link: `${upstreamConfig.artificialAnalysis}/models/${e.releaseSlug}`,
  };
}

/**
 * Closed-source frontier releases newest-first, one row per release family.
 * History comes from the AA changelog (full timeline incl. 2025 and earlier);
 * closed/open comes from exact index weights with curated creator rules as
 * fallback. Failures surface as 502 with stale-cache fallback.
 */
export function toClosedReleases(changelog: ChangelogModel[], weights: Map<string, boolean>): ClosedReleaseEntry[] {
  const entries = dedupeBy(
    changelog.filter((e) => isClosedChangelogRelease(e, weights)),
    (e) => e.releaseSlug,
  ).map(toClosedRelease);
  // Newest first; the client re-sorts defensively.
  entries.sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));
  return entries;
}

export const getClosedReleases = (ctx: AppContext): Promise<ClosedReleaseEntry[]> =>
  ctx.cache.withTtl(cacheKeys.closedReleases, STATIC_TTL_MS, async () => {
    // Independent payloads in parallel; longest path is max(fetch), not sum.
    const [models, changelog] = await Promise.all([getIntelligenceIndex(ctx), getChangelogModels(ctx)]);
    const entries = toClosedReleases(changelog, buildWeightsIndex(models));
    if (entries.length === 0) {
      throw new UpstreamError("Closed releases: changelog yielded 0 closed releases");
    }
    return { data: entries };
  });
