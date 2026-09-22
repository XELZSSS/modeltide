import { isOpenReleaseEntry, isValidRowId, keepOpenSourceRanking } from "@/server/parsers/parser-primitives";
import { ONE_MINUTE, SLOW_TTL_MS, SOURCE_LIMITS, normalizeModelLimit, sliceToLimit } from "@/shared/config";
import { upstreamConfig, UPSTREAM_FETCH_OPTS, cacheKeys } from "@/server/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { dedupeBy } from "@/shared/utils";
import { mapListModel, mapModel, summarizeLicenseDrops } from "@/server/parsers/hf-parser";
import type { HFModel } from "@/server/parsers/upstream-types";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireRows } from "@/server/sources/pipeline";

interface ModelQuery {
  sort: string;
  direction: string;
  limit: number;
}

const HF_API = upstreamConfig.huggingface;

function hfHeaders(ctx: AppContext): { authorization: string } | undefined {
  return ctx.hfToken ? { authorization: `Bearer ${ctx.hfToken}` } : undefined;
}

async function fetchHFModels(ctx: AppContext, sort: string, direction: string, limit: number): Promise<HFModel[]> {
  const params = new URLSearchParams({ sort, direction, limit: String(limit), full: "true" });
  const url = `${HF_API}?${params.toString()}`;
  const headers = hfHeaders(ctx);
  const items = await ctx.http.json<HFModel[]>(url, {
    ...UPSTREAM_FETCH_OPTS,
    ...(headers ? { headers } : {}),
  });
  if (!Array.isArray(items))
    throw new UpstreamError(
      `HuggingFace API returned non-array response (got ${items === null ? "null" : typeof items})`,
    );
  logLicenseDrops(ctx, items);
  return items;
}

/**
 * One license diagnostic per upstream response: rows the gate rejects because
 * they declare a non-open license are counted apart from rows that declare no
 * license at all, and only genuinely unrecognized tags are named — so
 * `license:other` (HF's own non-open sentinel) stops looking like schema drift.
 */
function logLicenseDrops(ctx: AppContext, items: HFModel[]): void {
  const { withoutTag, declaredNonOpen, unknownTags } = summarizeLicenseDrops(items);
  if (unknownTags.length > 0) ctx.log("info", `[huggingface] unrecognized license tags: ${unknownTags.join(", ")}`);
  if (withoutTag > 0 || declaredNonOpen > 0) {
    ctx.log(
      "info",
      `[huggingface] license gate: ${declaredNonOpen}/${items.length} rows declared non-open, ${withoutTag} declared no license`,
    );
  }
}

export const getModels = async (ctx: AppContext, p: ModelQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> => {
  const payload = await cachedPayload<OpenSourceModelEntry[]>(
    ctx,
    cacheKeys.openSourceModels(p.sort, p.direction, p.limit),
    SLOW_TTL_MS,
    async () => {
      const bucketLimit = normalizeModelLimit(p.limit);
      const items = await fetchHFModels(ctx, p.sort, p.direction, bucketLimit);
      if (items.length < bucketLimit) {
        ctx.log("info", `[huggingface] short response: got ${items.length}/${bucketLimit} rows`);
      }
      const kept = items
        .map(mapListModel)
        .filter((m): m is OpenSourceModelEntry => m !== null && m.license != null && keepOpenSourceRanking(m));
      const bucket = dedupeBy(kept, (m) => m.id);
      requireRows(bucket, "HuggingFace", "usable models", `raw=${items.length}, kept=0`);
      if (kept.length < items.length)
        ctx.log("info", `[huggingface] filtered ${items.length - kept.length}/${items.length} rows`);
      return { rows: bucket };
    },
  );
  return { ...payload, data: sliceToLimit(payload.data, p.limit) };
};

export const getReleases = (ctx: AppContext): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  cachedPayload(ctx, cacheKeys.openSourceReleases, SLOW_TTL_MS, async () => {
    const items = await fetchHFModels(ctx, "createdAt", "-1", normalizeModelLimit(SOURCE_LIMITS.openSourceReleases));
    const deduped = dedupeBy(
      items.map(mapListModel).filter((m): m is OpenSourceModelEntry => m !== null),
      (m) => m.id,
    );
    const mapped = deduped.filter(isOpenReleaseEntry);
    if (mapped.length < deduped.length)
      ctx.log(
        "info",
        `[huggingface] releases kept ${mapped.length}/${deduped.length} (raw=${items.length}, incl. other-licensed drops)`,
      );
    const sorted = mapped.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    requireRows(sorted, "HuggingFace", "usable releases", `raw=${items.length}, kept=0`);
    return { rows: sorted };
  });

export async function fetchHFModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
  const trimmed = id.trim();
  if (!isValidRowId(trimmed)) throw new ValidationError(`Invalid Hugging Face model id "${id}"`);
  const encoded = trimmed
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  let raw: HFModel;
  try {
    const headers = hfHeaders(ctx);
    raw = await ctx.http.json<HFModel>(`${HF_API}/${encoded}`, {
      ...UPSTREAM_FETCH_OPTS,
      ...(headers ? { headers } : {}),
    });
  } catch (err) {
    if (err instanceof UpstreamError && err.statusCode === 404) return null;
    throw err;
  }
  return mapModel(raw);
}

export const getModelById = (ctx: AppContext, id: string): Promise<SourcePayload<OpenSourceModelEntry | null>> => {
  const trimmed = id.trim();
  if (!isValidRowId(trimmed)) return Promise.reject(new ValidationError(`Invalid Hugging Face model id "${id}"`));
  return cachedPayload<OpenSourceModelEntry | null>(ctx, cacheKeys.openSourceModel(trimmed), SLOW_TTL_MS, async () => {
    const model = await fetchHFModelById(ctx, trimmed);
    return model == null ? { rows: model, ttl: ONE_MINUTE } : { rows: model };
  });
};
