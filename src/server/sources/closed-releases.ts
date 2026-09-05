import { PARTIAL_FAIL_TTL_MS, STATIC_TTL_MS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra";
import { isoDate } from "@/server/parsers/primitives";
import {
  getChangelogModels,
  getIntelligenceIndex,
  lastIndexEnrichFailures,
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
const CLOSED_CREATOR_RULES: Record<string, CreatorRule> = {
  OpenAI: {},
  Anthropic: {},
  Amazon: {},
  Baidu: {},
  Google: { exclude: /gemma/i },
  SpaceXAI: { exclude: /^grok-1\b/i },
  // Alias: some changelog snapshots label the vendor xAI instead of SpaceXAI.
  xAI: { exclude: /^grok-1\b/i },
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

function toClosedRelease(e: ChangelogModel): ClosedReleaseEntry | null {
  const raw = e.releaseDate.length > 10 ? e.releaseDate.slice(0, 10) : e.releaseDate;
  // Drop invalid calendar dates instead of sorting NaN unstably.
  if (!isoDate(raw)) return null;
  return {
    id: e.releaseSlug,
    model: e.releaseName,
    provider: e.creatorName,
    releaseDate: raw,
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
  // Sort newest-first BEFORE dedupe so the kept row per family is the latest.
  const sorted = [...changelog]
    .filter((e) => isClosedChangelogRelease(e, weights))
    .sort((a, b) => {
      const ta = Date.parse(a.releaseDate);
      const tb = Date.parse(b.releaseDate);
      const na = Number.isFinite(ta) ? ta : -Infinity;
      const nb = Number.isFinite(tb) ? tb : -Infinity;
      return nb - na;
    });
  const entries = dedupeBy(sorted, (e) => e.releaseSlug)
    .map(toClosedRelease)
    .filter((e): e is ClosedReleaseEntry => e !== null);
  // Newest first (validated YYYY-MM-DD strings sort lexicographically with no
  // timezone skew); the client re-sorts defensively.
  entries.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return entries;
}

export const getClosedReleases = (ctx: AppContext): Promise<ClosedReleaseEntry[]> =>
  ctx.cache.withTtl(cacheKeys.closedReleases, STATIC_TTL_MS, async () => {
    // Independent payloads in parallel; longest path is max(fetch), not sum.
    const [models, changelog] = await Promise.all([getIntelligenceIndex(ctx), getChangelogModels(ctx)]);
    const weights = buildWeightsIndex(models);
    const entries = toClosedReleases(changelog, weights);
    // Observability: exact index hits vs curated-rule fallbacks. A sudden
    // swing toward rules (or zero exact hits) means creator labels drifted.
    let exactHits = 0;
    let ruleHits = 0;
    for (const e of changelog) {
      if (!isClosedChangelogRelease(e, weights)) continue;
      if (weights.has(e.slug) || weights.has(e.releaseSlug)) exactHits++;
      else ruleHits++;
    }
    ctx.log("info", `[closed-releases] closed=${entries.length} (exact=${exactHits}, rule=${ruleHits})`);
    if (entries.length === 0) {
      throw new UpstreamError(`Closed releases yielded 0 rows (changelog=${changelog.length}, index=${models.length})`);
    }
    // Propagate upstream partial degradation instead of masking it for 6h.
    const partial = lastIndexEnrichFailures() > 0;
    if (partial) {
      ctx.log("warn", "[closed-releases] serving with partial index enrichment");
    }
    return { data: entries, ttl: partial ? PARTIAL_FAIL_TTL_MS : STATIC_TTL_MS };
  });
