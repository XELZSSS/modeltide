import {
  upstreamConfig,
  DEFAULT_TTL_MS,
  PARTIAL_FAIL_TTL_MS,
  UPSTREAM_TIMEOUT_MS,
  cacheKeys,
  normalizeModelLimit,
  sliceToLimit,
} from "@/shared/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError } from "@/server/infra/errors";
import { getOpenLicense } from "@/server/parsers/licenses";
import { isoDate, numIntNonNegative, toStringOrNull } from "@/server/parsers/primitives";
import { dedupeBy } from "@/shared/utils";

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
  const id = typeof m.id === "string" ? m.id.trim() : "";
  if (!id) return null;
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
  return dedupeBy(
    filtered.map(mapModel).filter((m): m is OpenSourceModelEntry => m !== null),
    (m) => m.id,
  );
}

export const getModels = (ctx: AppContext, p: ModelQuery): Promise<OpenSourceModelEntry[]> =>
  ctx.cache.withTtl(cacheKeys.openSourceModels(p.sort, p.direction, p.limit), DEFAULT_TTL_MS, async () => {
    // Snap to the normalized bucket so the fetched payload matches the cache key,
    // then slice back to the requested limit so ?limit=101 doesn't return 500 rows.
    const limit = normalizeModelLimit(p.limit);
    const items = await fetchHFModels(ctx, p.sort, p.direction, limit);
    const mapped = sliceToLimit(
      normalizeHfModels(items).filter((m) => m.downloads > 0),
      p.limit,
    );
    // Empty result means transient upstream failure — cache briefly to avoid
    // poisoning the key for 30m (mirrors news/openrouter partial-TTL policy).
    return { data: mapped, ttl: mapped.length === 0 ? PARTIAL_FAIL_TTL_MS : DEFAULT_TTL_MS };
  });

// mapModel only keeps entries whose createdAt parses (isoDate), so Date.parse below is always finite.
export const getReleases = (ctx: AppContext): Promise<OpenSourceModelEntry[]> =>
  ctx.cache.withTtl(cacheKeys.openSourceReleases, DEFAULT_TTL_MS, async () => {
    const items = await fetchHFModels(ctx, "createdAt", "-1", 500);
    const mapped = normalizeHfModels(
      items,
      (m) => Array.isArray(m.tags) && getOpenLicense(m.tags) !== null && isoDate(m.createdAt) !== null,
    );
    return { data: mapped.sort((a, b) => Date.parse(b.createdAt ?? "") - Date.parse(a.createdAt ?? "")) };
  });
