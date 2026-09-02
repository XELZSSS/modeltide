import { PARTIAL_FAIL_TTL_MS, STATIC_TTL_MS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { ArtificialAnalysisModel, ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, settled } from "@/server/infra/errors";
import { isoDate } from "@/server/parsers/primitives";
import { getChangelogModels, type ChangelogModel } from "@/server/sources/aa/changelog";
import { getIntelligenceIndex, lastIndexEnrichFailures } from "@/server/sources/aa/intelligence-index";
import { dedupeBy } from "@/shared/utils";

interface CreatorRule {
  include?: RegExp;
  exclude?: RegExp;
}

const CLOSED_CREATOR_RULES: Record<string, CreatorRule> = {
  OpenAI: {},
  Anthropic: {},
  Amazon: {},
  Baidu: {},
  Google: { exclude: /gemma/i },
  SpaceXAI: { exclude: /^grok-1\b/i },
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
  if (!Object.hasOwn(CLOSED_CREATOR_RULES, creatorName)) return false;
  const rule = CLOSED_CREATOR_RULES[creatorName];
  if (!rule) return false;
  if (rule.exclude?.test(haystack)) return false;
  if (rule.include && !rule.include.test(haystack)) return false;
  return true;
}

export function buildWeightsIndex(models: ArtificialAnalysisModel[]): Map<string, boolean> {
  const map = new Map<string, boolean>();
  for (const m of models) {
    if (typeof m.is_open_weights !== "boolean") continue;
    if (m.slug) map.set(m.slug, m.is_open_weights);
    if (m.id && m.id !== m.slug) map.set(m.id, m.is_open_weights);
  }
  return map;
}

export function isClosedChangelogRelease(e: ChangelogModel, weights: Map<string, boolean>): boolean {
  const exact = weights.get(e.slug) ?? weights.get(e.releaseSlug);
  if (exact === false) return true;
  if (exact === true) return false;
  return matchesClosedRule(e.creatorName, `${e.releaseSlug} ${e.releaseName}`);
}

function toClosedRelease(e: ChangelogModel): ClosedReleaseEntry | null {
  const raw = e.releaseDate.length > 10 ? e.releaseDate.slice(0, 10) : e.releaseDate;
  if (!isoDate(raw)) return null;
  return {
    id: e.releaseSlug,
    model: e.releaseName,
    provider: e.creatorName,
    releaseDate: raw,
    notes: "",
    link: `${upstreamConfig.artificialAnalysis}/models/${encodeURIComponent(e.releaseSlug)}`,
  };
}

export function toClosedReleases(changelog: ChangelogModel[], weights: Map<string, boolean>): ClosedReleaseEntry[] {
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
  entries.sort((a, b) => b.releaseDate.localeCompare(a.releaseDate));
  return entries;
}

export const getClosedReleases = (ctx: AppContext): Promise<ClosedReleaseEntry[]> =>
  ctx.cache.withTtl(cacheKeys.closedReleases, STATIC_TTL_MS, async () => {
    const [modelsRes, changelogRes] = await Promise.allSettled([getIntelligenceIndex(ctx), getChangelogModels(ctx)]);
    const models = settled(modelsRes, []);
    const changelog = settled(changelogRes, []);
    if (modelsRes.status === "rejected") ctx.log("warn", `[closed-releases] index failed, changelog-only`);
    if (changelogRes.status === "rejected") ctx.log("warn", `[closed-releases] changelog failed, index-only`);
    if (models.length === 0 && changelog.length === 0) {
      throw new UpstreamError(`Closed releases: both index and changelog failed`);
    }
    const weights = buildWeightsIndex(models);
    const entries = toClosedReleases(changelog, weights);
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
    const partial =
      lastIndexEnrichFailures() > 0 || modelsRes.status === "rejected" || changelogRes.status === "rejected";
    if (partial) {
      ctx.log("warn", "[closed-releases] serving partial (source failure or degraded enrichment)");
    }
    return { data: entries, ttl: partial ? PARTIAL_FAIL_TTL_MS : STATIC_TTL_MS };
  });
