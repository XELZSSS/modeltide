import { SLOW_TTL_MS, SOURCE_LIMITS, normalizeModelLimit, sliceToLimit } from "@/shared/config";
import { upstreamConfig, UPSTREAM_FETCH_OPTS, cacheKeys } from "@/server/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError, zeroUpstream } from "@/server/infra/errors";
import { getOpenLicense } from "@/server/parsers/licenses";
import { isoDate, numIntNonNegative, strOrNull } from "@/server/parsers/primitives";
import { dedupeBy } from "@/shared/utils";
import {
  filterMapDedupe,
  isOpenReleaseEntry,
  isValidHuggingFaceId,
  keepOpenSourceRanking,
} from "@/server/sources/data-filter";
import { nowIso, type SourcePayload } from "@/server/sources/types";

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

export interface ModelQuery {
  sort: string;
  direction: string;
  limit: number;
}

function resolveAuthor(m: HFModel, id: string): string | null {
  return strOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
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
    task: strOrNull(m.pipeline_tag),
    createdAt: isoDate(m.createdAt),
    lastModified: isoDate(m.lastModified),
    tags,
  };
}

const HF_API = upstreamConfig.huggingface;

// ── Raw fetch (no cache) ──────────────────────────────────────────
async function fetchHFModels(ctx: AppContext, sort: string, direction: string, limit: number): Promise<HFModel[]> {
  const params = new URLSearchParams({ sort, direction, limit: String(limit), full: "true" });
  const url = `${HF_API}?${params.toString()}`;
  const headers = ctx.hfToken ? { authorization: `Bearer ${ctx.hfToken}` } : undefined;
  const items = await ctx.http.json<HFModel[]>(url, {
    ...UPSTREAM_FETCH_OPTS,
    ...(headers ? { headers } : {}),
  });
  if (!Array.isArray(items))
    throw new UpstreamError(
      `HuggingFace API returned non-array response (got ${items === null ? "null" : typeof items})`,
    );
  const unknown = new Set<string>();
  for (const m of items) {
    if (!Array.isArray(m.tags)) continue;
    for (const t of m.tags) {
      if (typeof t !== "string" || !t.toLowerCase().startsWith("license:")) continue;
      if (getOpenLicense([t]) == null) unknown.add(t);
      if (unknown.size >= 5) break;
    }
    if (unknown.size >= 5) break;
  }
  if (unknown.size > 0) ctx.log("info", `[huggingface] unrecognized license tags: ${[...unknown].join(", ")}`);
  return items;
}

// ── Cached payload API (unified) ──────────────────────────────────
export const getModels = (ctx: AppContext, p: ModelQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  ctx.cache
    .withTtl<SourcePayload<OpenSourceModelEntry[]>>(
      cacheKeys.openSourceModels(p.sort, p.direction, p.limit),
      SLOW_TTL_MS,
      async () => {
        const bucketLimit = normalizeModelLimit(p.limit);
        const items = await fetchHFModels(ctx, p.sort, p.direction, bucketLimit);
        const kept = items
          .map(mapModel)
          .filter((m): m is OpenSourceModelEntry => m !== null && m.license != null && keepOpenSourceRanking(m));
        const bucket = dedupeBy(kept, (m) => m.id);
        if (bucket.length === 0) throw zeroUpstream("HuggingFace", "usable models", `raw=${items.length}, kept=0`);
        if (kept.length < items.length)
          ctx.log("info", `[huggingface] filtered ${items.length - kept.length}/${items.length} rows`);
        return { data: { data: bucket, fetchedAt: nowIso() } };
      },
    )
    .then((payload) => ({ data: sliceToLimit(payload.data, p.limit), fetchedAt: payload.fetchedAt }));

export const getReleases = (ctx: AppContext): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  ctx.cache.withTtl<SourcePayload<OpenSourceModelEntry[]>>(cacheKeys.openSourceReleases, SLOW_TTL_MS, async () => {
    const items = await fetchHFModels(ctx, "createdAt", "-1", normalizeModelLimit(SOURCE_LIMITS.openSourceReleases));
    const deduped = filterMapDedupe(items, mapModel, (m) => m.id);
    const mapped = deduped.filter(isOpenReleaseEntry);
    if (mapped.length < deduped.length)
      ctx.log(
        "info",
        `[huggingface] releases kept ${mapped.length}/${deduped.length} (raw=${items.length}, incl. other-licensed drops)`,
      );
    const sorted = mapped.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    if (sorted.length === 0) throw zeroUpstream("HuggingFace", "usable releases", `raw=${items.length}, kept=0`);
    return { data: { data: sorted, fetchedAt: nowIso() } };
  });

// ── Single-model fetch (no list window): detail pages resolve any id ──
export async function fetchHFModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
  const trimmed = id.trim();
  if (!isValidHuggingFaceId(trimmed)) throw new ValidationError(`Invalid Hugging Face model id "${id}"`);
  const encoded = trimmed
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  let raw: HFModel;
  try {
    const headers = ctx.hfToken ? { authorization: `Bearer ${ctx.hfToken}` } : undefined;
    raw = await ctx.http.json<HFModel>(`${HF_API}/${encoded}`, {
      ...UPSTREAM_FETCH_OPTS,
      ...(headers ? { headers } : {}),
    });
  } catch (err) {
    // Missing upstream row is a detail NotFound, not a 502.
    if (err instanceof UpstreamError && err.statusCode === 404) return null;
    throw err;
  }
  return mapModel(raw);
}

export const getModelById = (ctx: AppContext, id: string): Promise<SourcePayload<OpenSourceModelEntry | null>> =>
  ctx.cache.withTtl<SourcePayload<OpenSourceModelEntry | null>>(
    cacheKeys.openSourceModel(id.trim()),
    SLOW_TTL_MS,
    async () => {
      const model = await fetchHFModelById(ctx, id);
      return { data: { data: model, fetchedAt: nowIso() } };
    },
  );
