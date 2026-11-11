import { isValidRowId } from "@/server/formats/content-guards";
import { MAX_MODEL_ID_CHARS, ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { upstreamConfig } from "@/server/upstream/upstream";
import { cacheKeys } from "@/server/cache/keys";
import type { OpenSourceModelEntry, SourcePayload } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { encodeModelIdPath } from "@/shared/utils/models";
import { keepOpenSourceRanking, mapListModel, mapModel } from "./parse";
import { LicenseDropTally } from "./license-tally";
import { HF_LIST_FIELDS, type HfModel } from "./wire";

import type { OpenSourceModelsQuery } from "@/shared/query-schemas";
import { defineParamSource, requireArrayBody, requireRows } from "@/server/pipeline";
import { served, type ServedPayload } from "@/server/served-payload";

const HF_API = upstreamConfig.huggingface;
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;
function isValidHfModelId(value: string): boolean {
  return value.length <= MAX_MODEL_ID_CHARS && isValidRowId(value) && HF_MODEL_ID_RE.test(value);
}

// HF serves its maximum rows per response, so one page replaces the ten a limit of 100 needed: one subrequest and one
// round trip rather than a page walk.
const HF_PAGE_LIMIT = 1000;

// A healthy list page answers quickly, so the interactive default would let two attempts eat most of
// INFLIGHT_HANG_GUARD_MS and drop the whole refresh instead of degrading it.
const HF_PAGE_TIMEOUT_MS = 8_000;

/** Sorts that ask for recency rather than a ranking. The download gate exists so a *ranking* is not padded with repositories nobody has used, but the newest 1000 rows had zero downloads on every sample, so recency sorts keep the license gate and drop the download one. */
const RECENCY_SORTS: ReadonlySet<string> = new Set(["createdAt", "lastModified"]);

function hfListUrl(sort: string, limit: number): string {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  for (const field of HF_LIST_FIELDS) params.append("expand[]", field);
  return `${HF_API}?${params.toString()}`;
}

/** One page, one subrequest. The list is trendingScore-ordered, so the first HF_PAGE_LIMIT rows are the head of the ranking: hitting the ceiling is by design and logged, never reported as partial. */
async function fetchHFList(ctx: AppContext, sort: string): Promise<HfModel[]> {
  const url = hfListUrl(sort, HF_PAGE_LIMIT);
  const body = await ctx.http.json<unknown>(url, { timeoutMs: HF_PAGE_TIMEOUT_MS, retries: 1 });
  const items = requireArrayBody<HfModel>(url, body, "HuggingFace");
  if (items.length >= HF_PAGE_LIMIT) {
    ctx.log("info", "[huggingface] row ceiling reached, using the top page", {
      raw: items.length,
      ceiling: HF_PAGE_LIMIT,
    });
  }
  return items;
}

function logLicenseDrops(ctx: AppContext, rowCount: number, tally: LicenseDropTally): void {
  const { withoutTag, declaredNonOpen, unknownTags, noDownloads } = tally.drops();
  if (unknownTags.length > 0) ctx.log("info", `[huggingface] unrecognized license tags: ${unknownTags.join(", ")}`);
  if (withoutTag > 0 || declaredNonOpen > 0) {
    ctx.log(
      "info",
      `[huggingface] license gate: ${declaredNonOpen}/${rowCount} rows declared non-open, ${withoutTag} declared no license`,
    );
  }
  if (noDownloads > 0) {
    ctx.log("info", `[huggingface] ranking gate: ${noDownloads}/${rowCount} rows dropped for zero downloads`);
  }
}

function parseHFItems(items: HfModel[], ctx: AppContext, rankByUsage: boolean): OpenSourceModelEntry[] {
  const tally = new LicenseDropTally();
  // One pass over the page: a `map`/`filter`/`dedupeBy` chain walked the rows three times. The tally sees them in the same order.
  const bucket: OpenSourceModelEntry[] = [];
  const keptIds = new Set<string>();
  let kept = 0;
  for (const item of items) {
    const mapped = mapListModel(item, tally);
    if (mapped === null || mapped.license === null) continue;
    if (rankByUsage && !keepOpenSourceRanking(mapped, tally)) continue;
    kept += 1;
    if (keptIds.has(mapped.id)) continue;
    keptIds.add(mapped.id);
    bucket.push(mapped);
  }
  logLicenseDrops(ctx, items.length, tally);
  requireRows(bucket, "HuggingFace", "usable models", `raw=${items.length}, kept=0`);
  const dropped = items.length - kept;
  if (dropped > 0) {
    ctx.log(
      "info",
      `[huggingface] filtered ${dropped}/${items.length} rows (${
        rankByUsage ? "non-open license or zero downloads" : "non-open license"
      })`,
    );
  }
  return bucket;
}

/** The ranking list and the home dashboard ask for the same page at the same depth: one cache entry, one upstream call. */
export const getHomeOpenSourceModels = defineParamSource<OpenSourceModelsQuery, HfModel[], OpenSourceModelEntry[]>(
  (params) => cacheKeys.openSourceModels(params.sort),
  {
    ttl: SLOW_TTL_MS,
    label: "HuggingFace",
    // Shared with the home dashboard, but the list route returns this payload, so the entry keeps its body.
    served: true,
    fetch: (ctx, params) => fetchHFList(ctx, params.sort),
    parse: (rows, ctx, params) => parseHFItems(rows, ctx, !RECENCY_SORTS.has(params.sort)),
  },
);

async function fetchHfModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
  const encoded = encodeModelIdPath(id);
  let raw: HfModel;
  try {
    raw = await ctx.http.json<HfModel>(`${HF_API}/${encoded}`);
  } catch (err) {
    // A missing repo answers 404, a private or gated one 401/403: from the public API both mean "this id is not readable", and a 4xx never retries.
    if (err instanceof UpstreamError && (err.statusCode === 404 || err.statusCode === 401 || err.statusCode === 403)) {
      return null;
    }
    throw err;
  }
  return mapModel(raw);
}

const NEGATIVE_STALE_CAP_MS = 5 * ONE_MINUTE;

/** An id that cannot exist on Hugging Face (HF itself answers 404) is a miss, not a bad request: the API would answer 400, which never retries. The miss is cached as briefly as the real 404 path, and the stale cap reaches only that copy. */
const modelByIdSource = defineParamSource<string, OpenSourceModelEntry | null, OpenSourceModelEntry | null>(
  (id) => cacheKeys.openSourceModel(id),
  {
    ttl: SLOW_TTL_MS,
    label: "HuggingFace model",
    // No `served`: `getOpenSourceModels` composes this row into a fresh list envelope, so a stored response copy would never be served.
    scope: {
      staleCapMs: (value) =>
        (value as SourcePayload<OpenSourceModelEntry | null>).data === null ? NEGATIVE_STALE_CAP_MS : undefined,
    },
    fetch: (ctx, id) => (isValidHfModelId(id) ? fetchHfModelById(ctx, id) : Promise.resolve(null)),
    parse: (raw) => raw,
    partialWhen: ({ raw }) => (raw == null ? { partial: false, ttl: ONE_MINUTE } : { partial: false }),
  },
);

/** The list route and the by-id lookup answer one domain, so the by-id result is composed into the list envelope here; the composed payload carries no body, and only the timestamp that names the ETag travels from the lookup. */
export async function getOpenSourceModels(
  ctx: AppContext,
  p: OpenSourceModelsQuery,
): Promise<ServedPayload<OpenSourceModelEntry[]>> {
  if (!p.id) return getHomeOpenSourceModels(ctx, p);
  const single = await modelByIdSource(ctx, p.id.trim());
  const rows = single.payload.data == null ? [] : [single.payload.data];
  return served({ data: rows, partial: single.payload.partial }, { producedAt: single.producedAt });
}
