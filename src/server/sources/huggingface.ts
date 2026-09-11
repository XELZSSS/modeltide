import { ONE_MINUTE, SLOW_TTL_MS, SOURCE_LIMITS, normalizeModelLimit, sliceToLimit } from "@/shared/config";
import { upstreamConfig, UPSTREAM_FETCH_OPTS, cacheKeys } from "@/server/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError, zeroUpstream } from "@/server/infra/errors";
import { dedupeBy } from "@/shared/utils";
import type { HFModel } from "@/server/parsers/hf-models";
import { findUnknownLicenseTags, mapModel } from "@/server/parsers/hf-models";
import { isOpenReleaseEntry, isValidRowId, keepOpenSourceRanking } from "@/server/parsers/data-filter";
import { nowIso, type SourcePayload } from "@/server/sources/types";

export interface ModelQuery {
  sort: string;
  direction: string;
  limit: number;
}

const HF_API = upstreamConfig.huggingface;

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
  const unknown = findUnknownLicenseTags(items);
  if (unknown.length > 0) ctx.log("info", `[huggingface] unrecognized license tags: ${unknown.join(", ")}`);
  return items;
}

export const getModels = (ctx: AppContext, p: ModelQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  ctx.cache
    .withTtl<SourcePayload<OpenSourceModelEntry[]>>(
      cacheKeys.openSourceModels(p.sort, p.direction, p.limit),
      SLOW_TTL_MS,
      async () => {
        const bucketLimit = normalizeModelLimit(p.limit);
        const items = await fetchHFModels(ctx, p.sort, p.direction, bucketLimit);
        // HF may cap `limit` server-side; log the shortfall so a silent
        // truncation is visible in cron/worker logs instead of looking full.
        if (items.length < bucketLimit) {
          ctx.log("info", `[huggingface] short response: got ${items.length}/${bucketLimit} rows`);
        }
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
    const deduped = dedupeBy(
      items.map(mapModel).filter((m): m is OpenSourceModelEntry => m !== null),
      (m) => m.id,
    );
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
  if (!isValidRowId(trimmed)) throw new ValidationError(`Invalid Hugging Face model id "${id}"`);
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

export const getModelById = (ctx: AppContext, id: string): Promise<SourcePayload<OpenSourceModelEntry | null>> => {
  // Validate before keying: garbage ids must not produce cache keys (and
  // therefore KV writes) at all, not even for the failed lookup.
  const trimmed = id.trim();
  if (!isValidRowId(trimmed)) return Promise.reject(new ValidationError(`Invalid Hugging Face model id "${id}"`));
  return ctx.cache.withTtl<SourcePayload<OpenSourceModelEntry | null>>(
    cacheKeys.openSourceModel(trimmed),
    SLOW_TTL_MS,
    async () => {
      const model = await fetchHFModelById(ctx, trimmed);
      // 404 (null) is a lookup miss, not data: cache it for 60s only so a
      // newly-published model becomes visible quickly instead of sticking to
      // NotFound for the full 2h slow TTL.
      if (model == null) return { data: { data: model, fetchedAt: nowIso() }, ttl: ONE_MINUTE };
      return { data: { data: model, fetchedAt: nowIso() } };
    },
  );
};
