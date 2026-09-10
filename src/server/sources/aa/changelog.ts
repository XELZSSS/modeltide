import type { AppContext } from "@/server/context";
import { SOURCE_LIMITS, STATIC_TTL_MS } from "@/shared/config";
import { MAX_FEED_BYTES, UPSTREAM_FETCH_OPTS, cacheKeys, upstreamConfig } from "@/server/config";
import { zeroUpstream } from "@/server/infra/errors";
import { extractNeedleJsonArrays, MAX_SCAN_CHARS } from "@/server/parsers/rsc-scan";
import { byDateDesc } from "@/server/parsers/shaping";
import { isRecord, str } from "@/server/parsers/primitives";

const CHANGELOG_PATH = "/changelog";

export interface ChangelogModel {
  slug: string;
  name: string;
  releaseSlug: string;
  releaseName: string;
  releaseDate: string;
  creatorName: string;
}

const MODELS_KEY = '"models"';
const CANDIDATE_PREFIX_CHARS = 256;
// Two-stage windows live in extractNeedleJsonArrays; these are the changelog
// sizes: small first (typical payloads), full 8MB scan window as fallback.
const SMALL_SUFFIX_CHARS = 256 * 1024 + CANDIDATE_PREFIX_CHARS;
const CANDIDATE_SUFFIX_CHARS = MAX_SCAN_CHARS + CANDIDATE_PREFIX_CHARS;

function extractModelsArrays(html: string): unknown[] {
  return extractNeedleJsonArrays(html, MODELS_KEY, {
    prefixChars: CANDIDATE_PREFIX_CHARS,
    smallSuffixChars: SMALL_SUFFIX_CHARS,
    maxSuffixChars: CANDIDATE_SUFFIX_CHARS,
    unescape: true,
  });
}

function isChangelogRaw(e: unknown): e is Record<string, unknown> {
  if (!isRecord(e)) return false;
  const r = e as Record<string, unknown>;
  // Reject arrays: a repeated <creator>/<release> element in the payload
  // parses as an array, and str() on it would yield "" silently downstream.
  if (Array.isArray(r.slug) || Array.isArray(r.name) || Array.isArray(r.releaseDate)) return false;
  if (typeof r.slug !== "string" || typeof r.name !== "string" || typeof r.releaseDate !== "string") return false;
  if (!isRecord(r.release) || !isRecord(r.creator)) return false;
  return true;
}

function toChangelogModel(e: Record<string, unknown>): ChangelogModel | null {
  const release = e.release as Record<string, unknown>;
  const creator = e.creator as Record<string, unknown>;
  const slug = str(e.slug).trim();
  const name = str(e.name).trim();
  const releaseSlug = str(release.slug).trim();
  const releaseName = str(release.name).trim();
  const releaseDate = str(e.releaseDate).trim();
  const creatorName = str(creator.name).trim();
  if (!slug || !name || !releaseSlug || !releaseName || !releaseDate || !creatorName) return null;
  return { slug, name, releaseSlug, releaseName, releaseDate, creatorName };
}

export function parseChangelogModels(html: string): ChangelogModel[] {
  let best: ChangelogModel[] = [];
  for (const v of extractModelsArrays(html)) {
    if (!Array.isArray(v)) continue;
    const mapped = (v as unknown[])
      .filter(isChangelogRaw)
      .map(toChangelogModel)
      .filter((m): m is ChangelogModel => m !== null);
    if (mapped.length > best.length) best = mapped;
  }
  return best;
}

async function fetchChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  const html = await ctx.http.text(
    `${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`,
    {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      ...UPSTREAM_FETCH_OPTS,
    },
    MAX_FEED_BYTES,
  );
  const models = parseChangelogModels(html);
  if (models.length === 0) {
    throw zeroUpstream("AA changelog", "models", `raw=1 page, kept=0, markup changed?, body=${html.length}B`);
  }
  // The embedded payload is a catalog snapshot, not date-ordered: sort newest
  // first so the cap keeps the recent window instead of an arbitrary head.
  return models.sort(byDateDesc((m) => m.releaseDate)).slice(0, SOURCE_LIMITS.changelog);
}

export async function getChangelogModels(ctx: AppContext): Promise<ChangelogModel[]> {
  return ctx.cache.withTtl(cacheKeys.changelog, STATIC_TTL_MS, async () => {
    return { data: await fetchChangelogModels(ctx) };
  });
}
