import {
  upstreamConfig,
  SLOW_TTL_MS,
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
import { dedupeBy, toStringOrNull } from "@/shared/utils";
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

export const getModels = (ctx: AppContext, p: ModelQuery): Promise<OpenSourceModelEntry[]> =>
  ctx.cache.withTtl(cacheKeys.openSourceModels(p.sort, p.direction, p.limit), SLOW_TTL_MS, async () => {
    // Snap to the normalized bucket (50/100/500) to bound the KV key space,
    // then slice back to the requested limit. Small limits still fetch the
    // bucket size on a cold miss, but cache hits absorb repeats and the
    // per-path rate limit bounds cold-miss fan-out.
    const limit = normalizeModelLimit(p.limit);
    const items = await fetchHFModels(ctx, p.sort, p.direction, limit);
    // Map, drop zero-download stubs, then dedupe in upstream ranking order so
    // a duplicate id keeps its ranked row rather than a stub.
    const kept = items.map(mapModel).filter((m): m is OpenSourceModelEntry => m !== null && keepOpenSourceRanking(m));
    const mapped = sliceToLimit(
      dedupeBy(kept, (m) => m.id),
      p.limit,
    );
    // Empty means transient upstream/filter failure: throw so withTtl serves
    // stale instead of poisoning the key with a cached [].
    if (mapped.length === 0) {
      throw new UpstreamError(`HuggingFace returned no usable models (raw=${items.length}, kept=0)`);
    }
    if (kept.length < items.length) {
      ctx.log("info", `[huggingface] filtered ${items.length - kept.length}/${items.length} rows`);
    }
    return { data: mapped, ttl: SLOW_TTL_MS };
  });

// Filter on the mapped rows (HF ids are unique per response).
export const getReleases = (ctx: AppContext): Promise<OpenSourceModelEntry[]> =>
  ctx.cache.withTtl(cacheKeys.openSourceReleases, SLOW_TTL_MS, async () => {
    const items = await fetchHFModels(ctx, "createdAt", "-1", 500);
    const deduped = filterMapDedupe(items, mapModel, (m) => m.id);
    const mapped = deduped.filter(isOpenReleaseEntry);
    // Observability: releases drop rows without an open license or date
    // (including `other`-licensed models, kept out deliberately). A sudden
    // kept≈0 means the license taxonomy drifted, not that HF is empty.
    if (mapped.length < deduped.length) {
      ctx.log(
        "info",
        `[huggingface] releases kept ${mapped.length}/${deduped.length} (raw=${items.length}, incl. other-licensed drops)`,
      );
    }
    // createdAt is validated YYYY-MM-DD by isOpenReleaseEntry: lexicographic
    // order is chronological with no timezone skew.
    const sorted = mapped.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    if (sorted.length === 0) {
      throw new UpstreamError(`HuggingFace returned no usable releases (raw=${items.length}, kept=0)`);
    }
    return { data: sorted, ttl: SLOW_TTL_MS };
  });
