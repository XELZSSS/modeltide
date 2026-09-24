import { isValidRowId } from "@/server/parsers/parser-primitives";
import { ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { normalizeModelLimit, sliceToLimit } from "@/server/config/limits";
import { upstreamConfig, UPSTREAM_FETCH_OPTS, cacheKeys } from "@/server/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { dedupeBy } from "@/shared/utils";
import { LicenseDropTally, keepOpenSourceRanking, mapListModel, mapModel } from "@/server/parsers/hf-parser";
import type { HFModel } from "@/server/parsers/upstream-types";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireRows } from "@/server/sources/pipeline";

interface ModelQuery {
  sort: string;
  direction: string;
  limit: number;
}

const HF_API = upstreamConfig.huggingface;
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;

function isValidHFModelId(value: string): boolean {
  return value.length <= 200 && HF_MODEL_ID_RE.test(value);
}

const HF_LIST_FIELDS = ["author", "downloads", "likes", "tags", "pipeline_tag", "createdAt", "lastModified"];

async function fetchHFModels(ctx: AppContext, sort: string, direction: string, limit: number): Promise<HFModel[]> {
  const params = new URLSearchParams({ sort, direction, limit: String(limit) });
  for (const field of HF_LIST_FIELDS) params.append("expand[]", field);
  const url = `${HF_API}?${params.toString()}`;
  const items = await ctx.http.json<HFModel[]>(url, UPSTREAM_FETCH_OPTS);
  if (!Array.isArray(items))
    throw new UpstreamError(
      `HuggingFace API returned non-array response (got ${items === null ? "null" : typeof items})`,
    );
  return items;
}

function logLicenseDrops(ctx: AppContext, rowCount: number, tally: LicenseDropTally): void {
  const { withoutTag, declaredNonOpen, unknownTags } = tally.drops();
  if (unknownTags.length > 0) ctx.log("info", `[huggingface] unrecognized license tags: ${unknownTags.join(", ")}`);
  if (withoutTag > 0 || declaredNonOpen > 0) {
    ctx.log(
      "info",
      `[huggingface] license gate: ${declaredNonOpen}/${rowCount} rows declared non-open, ${withoutTag} declared no license`,
    );
  }
}

export const getModels = async (ctx: AppContext, p: ModelQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> => {
  const payload = await cachedPayload<OpenSourceModelEntry[]>(
    ctx,
    cacheKeys.openSourceModels(p.sort, p.direction, p.limit),
    SLOW_TTL_MS,
    async (ctx) => {
      const bucketLimit = normalizeModelLimit(p.limit);
      const items = await fetchHFModels(ctx, p.sort, p.direction, bucketLimit);
      if (items.length < bucketLimit) {
        ctx.log("info", `[huggingface] short response: got ${items.length}/${bucketLimit} rows`);
      }
      const tally = new LicenseDropTally();
      const kept = items
        .map((m) => mapListModel(m, tally))
        .filter((m): m is OpenSourceModelEntry => m !== null && m.license != null && keepOpenSourceRanking(m));
      logLicenseDrops(ctx, items.length, tally);
      const bucket = dedupeBy(kept, (m) => m.id);
      requireRows(bucket, "HuggingFace", "usable models", `raw=${items.length}, kept=0`);
      if (kept.length < items.length)
        ctx.log("info", `[huggingface] filtered ${items.length - kept.length}/${items.length} rows`);
      return { rows: bucket, partial: items.length < bucketLimit };
    },
  );
  return { ...payload, data: sliceToLimit(payload.data, p.limit) };
};

async function fetchHFModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
  const trimmed = id.trim();
  if (!isValidRowId(trimmed) || !isValidHFModelId(trimmed)) {
    throw new ValidationError(`Invalid Hugging Face model id "${id}"`);
  }
  const encoded = trimmed
    .split("/")
    .map((seg) => encodeURIComponent(seg))
    .join("/");
  let raw: HFModel;
  try {
    raw = await ctx.http.json<HFModel>(`${HF_API}/${encoded}`, UPSTREAM_FETCH_OPTS);
  } catch (err) {
    if (err instanceof UpstreamError && err.statusCode === 404) return null;
    throw err;
  }
  return mapModel(raw);
}

const NEGATIVE_STALE_CAP_MS = 5 * ONE_MINUTE;

export const getModelById = (ctx: AppContext, id: string): Promise<SourcePayload<OpenSourceModelEntry | null>> => {
  const trimmed = id.trim();
  if (!isValidRowId(trimmed) || !isValidHFModelId(trimmed)) {
    return Promise.reject(new ValidationError(`Invalid Hugging Face model id "${id}"`));
  }
  return cachedPayload<OpenSourceModelEntry | null>(
    ctx,
    cacheKeys.openSourceModel(trimmed),
    SLOW_TTL_MS,
    async (ctx) => {
      const model = await fetchHFModelById(ctx, trimmed);
      return model == null ? { rows: model, ttl: ONE_MINUTE } : { rows: model };
    },
    { memoryOnly: true, staleCapMs: NEGATIVE_STALE_CAP_MS },
  );
};
