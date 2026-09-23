import { isValidRowId } from "@/server/parsers/parser-primitives";
import { ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { SOURCE_LIMITS, normalizeModelLimit, sliceToLimit } from "@/server/config/limits";
import { upstreamConfig, UPSTREAM_FETCH_OPTS, cacheKeys } from "@/server/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { dedupeBy } from "@/shared/utils";
import {
  LicenseDropTally,
  isOpenReleaseEntry,
  keepOpenSourceRanking,
  mapListModel,
  mapModel,
} from "@/server/parsers/hf-parser";
import type { HFModel } from "@/server/parsers/upstream-types";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireRows } from "@/server/sources/pipeline";

interface ModelQuery {
  sort: string;
  direction: string;
  limit: number;
}

const HF_API = upstreamConfig.huggingface;
// Namespace optional: the list gate admits historical repos without one (`gpt2`).
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;

function isValidHFModelId(value: string): boolean {
  return value.length <= 200 && HF_MODEL_ID_RE.test(value);
}

async function fetchHFModels(ctx: AppContext, sort: string, direction: string, limit: number): Promise<HFModel[]> {
  const params = new URLSearchParams({ sort, direction, limit: String(limit), full: "true" });
  const url = `${HF_API}?${params.toString()}`;
  const items = await ctx.http.json<HFModel[]>(url, UPSTREAM_FETCH_OPTS);
  if (!Array.isArray(items))
    throw new UpstreamError(
      `HuggingFace API returned non-array response (got ${items === null ? "null" : typeof items})`,
    );
  return items;
}

/** `license:other` is HF's own non-open sentinel, not schema drift; `tally` was filled by the mapping pass. */
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
    async () => {
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
      return { rows: bucket };
    },
  );
  return { ...payload, data: sliceToLimit(payload.data, p.limit) };
};

export const getReleases = (ctx: AppContext): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  cachedPayload(ctx, cacheKeys.openSourceReleases, SLOW_TTL_MS, async () => {
    const items = await fetchHFModels(ctx, "createdAt", "-1", normalizeModelLimit(SOURCE_LIMITS.openSourceReleases));
    const tally = new LicenseDropTally();
    const deduped = dedupeBy(
      items.map((m) => mapListModel(m, tally)).filter((m): m is OpenSourceModelEntry => m !== null),
      (m) => m.id,
    );
    logLicenseDrops(ctx, items.length, tally);
    const mapped = deduped.filter(isOpenReleaseEntry);
    if (mapped.length < deduped.length)
      ctx.log(
        "info",
        `[huggingface] releases kept ${mapped.length}/${deduped.length} (raw=${items.length}, incl. other-licensed drops)`,
      );
    requireRows(mapped, "HuggingFace", "usable releases", `raw=${items.length}, kept=0`);
    return { rows: mapped };
  });

export async function fetchHFModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
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

/** A cached 404 must not be re-served for the generic stale-if-error window. */
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
    async () => {
      const model = await fetchHFModelById(ctx, trimmed);
      return model == null ? { rows: model, ttl: ONE_MINUTE } : { rows: model };
    },
    // Attacker-controlled high-cardinality ids: bounded isolate cache, not an unbounded KV namespace.
    { memoryOnly: true, staleCapMs: NEGATIVE_STALE_CAP_MS },
  );
};
