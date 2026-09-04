import {
  upstreamConfig,
  SLOW_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  UPSTREAM_TIMEOUT_MS,
  cacheKeys,
  normalizeModelLimit,
  sliceToLimit,
} from "@/shared/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra";
import { getOpenLicense } from "@/server/parsers/primitives";
import { isoDate, numIntNonNegative } from "@/server/parsers/primitives";
import { toStringOrNull } from "@/shared/utils";
import {
  filterMapDedupe,
  isOpenReleaseEntry,
  isValidHuggingFaceId,
  keepOpenSourceRanking,
} from "@/server/sources/data-filter";

interface HFModel {
  id?: string;
  author?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string | null;
  createdAt?: string | null;
  lastModified?: string | null;
  tags?: string[];
}

interface ModelQuery {
  sort: string;
  direction: string;
  limit: number;
}

function resolveAuthor(m: HFModel, id: string): string | null {
  return toStringOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
}

function mapModel(m: HFModel): OpenSourceModelEntry | null {
  if (!isValidHuggingFaceId(m.id)) return null;
  const id = (m.id as string).trim();
  const downloads = numIntNonNegative(m.downloads) ?? 0;
  const likes = numIntNonNegative(m.likes) ?? 0;
  const tags = Array.isArray(m.tags) ? m.tags.filter((t): t is string => typeof t === "string") : [];
  const license = getOpenLicense(tags);
  return {
    id,
    author: resolveAuthor(m, id),
    downloads,
    likes,
    license,
    task: toStringOrNull(m.pipeline_tag),
    createdAt: isoDate(m.createdAt),
    lastModified: isoDate(m.lastModified),
    tags,
  };
}

const HF_API = upstreamConfig.huggingface;

async function fetchHFModels(ctx: AppContext, sort: string, direction: string, limit: number): Promise<HFModel[]> {
  const url = new URL(HF_API);
  url.searchParams.set("sort", sort);
  url.searchParams.set("direction", direction);
  url.searchParams.set("limit", String(limit));
  url.searchParams.set("full", "true");
  const headers = ctx.hfToken ? { authorization: `Bearer ${ctx.hfToken}` } : undefined;
  const items = await ctx.http.json<HFModel[]>(url.toString(), {
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    retries: 1,
    ...(headers ? { headers } : {}),
  });
  if (!Array.isArray(items))
    throw new UpstreamError(
      `HuggingFace API returned non-array response (got ${items === null ? "null" : typeof items})`,
    );
  return items;
}

function normalizeHfModels(items: HFModel[], filterFn?: (m: HFModel) => boolean): OpenSourceModelEntry[] {
  const filtered = filterFn ? items.filter(filterFn) : items;
  // Unified pipeline: map drops dirty rows, dedupe keeps first per id.
  return filterMapDedupe(filtered, mapModel, (m) => m.id);
}

export const getModels = (ctx: AppContext, p: ModelQuery): Promise<OpenSourceModelEntry[]> =>
  ctx.cache.withTtl(cacheKeys.openSourceModels(p.sort, p.direction, p.limit), SLOW_TTL_MS, async () => {
    // Snap to the normalized bucket, then slice back to the requested limit.
    const limit = normalizeModelLimit(p.limit);
    const items = await fetchHFModels(ctx, p.sort, p.direction, limit);
    const mapped = sliceToLimit(
      normalizeHfModels(items).filter(keepOpenSourceRanking),
      p.limit,
    );
    // Empty means transient failure — cache briefly to avoid poisoning the key.
    return { data: mapped, ttl: mapped.length === 0 ? PARTIAL_FAIL_TTL_MS : SLOW_TTL_MS };
  });

// Filter on the mapped rows (HF ids are unique per response).
export const getReleases = (ctx: AppContext): Promise<OpenSourceModelEntry[]> =>
  ctx.cache.withTtl(cacheKeys.openSourceReleases, SLOW_TTL_MS, async () => {
    const items = await fetchHFModels(ctx, "createdAt", "-1", 500);
    const mapped = filterMapDedupe(items, mapModel, (m) => m.id).filter(isOpenReleaseEntry);
    return { data: mapped.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "")) };
  });
