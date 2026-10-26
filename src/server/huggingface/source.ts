import { isValidRowId } from "@/server/formats/content-guards";
import { MAX_MODEL_ID_CHARS, ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { upstreamConfig } from "@/server/upstream/upstream";
import { cacheKeys } from "@/server/cache/keys";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { UpstreamError } from "@/server/api/errors";
import { dedupeBy } from "@/shared/utils";
import { encodeModelIdPath } from "@/shared/utils/models";
import { keepOpenSourceRanking, mapListModel, mapModel } from "./parse";
import { LicenseDropTally } from "./license-tally";
import type { HFModel } from "@/server/formats/wire-types";

import type { SourcePayload } from "@/shared/types";
import type { OpenSourceModelsQuery } from "@/shared/query-schemas";
import { defineParamSource, requireArrayBody, requireRows } from "@/server/pipeline";

const HF_API = upstreamConfig.huggingface;
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;
function isValidHFModelId(value: string): boolean {
  return value.length <= MAX_MODEL_ID_CHARS && isValidRowId(value) && HF_MODEL_ID_RE.test(value);
}

const HF_LIST_FIELDS = ["author", "downloads", "likes", "tags", "pipeline_tag", "createdAt", "lastModified"];

// HF serves up to 1000 rows per response, so one page replaces the ten a limit of 100 needed: one subrequest and one
// round trip against the invocation's 50-subrequest and connection budget. 1000 rows weigh ~0.5 MB, inside MAX_JSON_BYTES.
const HF_PAGE_LIMIT = 1000;

// A healthy list page answers in ~1.3 s, so the 12 s interactive default would let two attempts eat most of
// INFLIGHT_HANG_GUARD_MS (30 s) and drop the whole refresh instead of degrading it.
const HF_PAGE_TIMEOUT_MS = 8_000;

/**
 * Sorts that ask for recency rather than a ranking. The download gate exists so a *ranking* is not padded with
 * repositories nobody has used yet, but sorting by creation date returns the repositories created hours ago: measured on
 * the live API, the newest 1000 rows had zero downloads on every sample, so the gate left 0 of 1000 usable rows and
 * `?sort=createdAt` answered 502 on every call — then held the 45 s failure cooldown, which is what made it look like a
 * dead upstream. Recency sorts keep the license gate and drop the download one: an unlicensed repository is not
 * open-source whatever its age, while a new one simply has no usage history yet.
 */
const RECENCY_SORTS: ReadonlySet<string> = new Set(["createdAt", "lastModified"]);

function hfListUrl(sort: string, limit: number): string {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  for (const field of HF_LIST_FIELDS) params.append("expand[]", field);
  return `${HF_API}?${params.toString()}`;
}

/**
 * One page, one subrequest. The list is trendingScore-ordered, so the first HF_PAGE_LIMIT rows are the head of the
 * ranking: hitting the ceiling is by design and always yields the same top-N, so it is logged but never reported as
 * partial. A failed page throws and degrades through the cache's stale fallback like every other source.
 */
async function fetchHFList(ctx: AppContext, sort: string): Promise<HFModel[]> {
  const url = hfListUrl(sort, HF_PAGE_LIMIT);
  const body = await ctx.http.json<unknown>(url, { timeoutMs: HF_PAGE_TIMEOUT_MS, retries: 1 });
  const items = requireArrayBody<HFModel>(url, body, "HuggingFace");
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

function parseHFItems(items: HFModel[], ctx: AppContext, rankByUsage: boolean): OpenSourceModelEntry[] {
  const tally = new LicenseDropTally();
  const kept = items
    .map((m) => mapListModel(m, tally))
    .filter(
      (m): m is OpenSourceModelEntry =>
        m !== null && m.license != null && (!rankByUsage || keepOpenSourceRanking(m, tally)),
    );
  logLicenseDrops(ctx, items.length, tally);
  const bucket = dedupeBy(kept, (m) => m.id);
  requireRows(bucket, "HuggingFace", "usable models", `raw=${items.length}, kept=0`);
  const dropped = items.length - kept.length;
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

/**
 * How long an open-source payload may stay cached at the origin. `src/server/registry.ts` reads this same constant for
 * the route's HTTP cache headers, so the edge window cannot drift from the origin window.
 */
export const OPEN_SOURCE_MODELS_TTL_MS = SLOW_TTL_MS;

/** The ranking list and the home dashboard ask for the same page at the same depth: one cache entry, one upstream call. */

/** The page together with the sort it was fetched for, because `parse` receives no params and the gates depend on it. */
interface HFPage {
  rows: HFModel[];
  sort: string;
}

const listSource = defineParamSource<OpenSourceModelsQuery, HFPage, OpenSourceModelEntry[]>(
  (params) => cacheKeys.openSourceModels(params.sort),
  {
    ttl: OPEN_SOURCE_MODELS_TTL_MS,
    label: "HuggingFace",
    // Shared with the home dashboard, but the list route returns this payload, so the entry keeps its body.
    served: true,
    fetch: async (ctx, params) => ({ rows: await fetchHFList(ctx, params.sort), sort: params.sort }),
    parse: (page, ctx) => parseHFItems(page.rows, ctx, !RECENCY_SORTS.has(page.sort)),
  },
);

export const getHomeOpenSourceModels = (
  ctx: AppContext,
  p: OpenSourceModelsQuery,
): Promise<SourcePayload<OpenSourceModelEntry[]>> => listSource(ctx, p);

async function fetchHFModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
  const encoded = encodeModelIdPath(id);
  let raw: HFModel;
  try {
    raw = await ctx.http.getJson<HFModel>(`${HF_API}/${encoded}`);
  } catch (err) {
    // A missing repo answers 404, a private or gated one 401/403: from the public API both mean "this id is not
    // readable". A 4xx never retries, so treating only 404 as a miss pinned the detail page on the error boundary
    // forever — the retry asks the same question.
    if (err instanceof UpstreamError && (err.statusCode === 404 || err.statusCode === 401 || err.statusCode === 403)) {
      return null;
    }
    throw err;
  }
  return mapModel(raw);
}

const NEGATIVE_STALE_CAP_MS = 5 * ONE_MINUTE;

// An id that cannot exist on Hugging Face is a miss, not a bad request: the API would answer 400, and a 4xx never
// retries, so a junk URL pinned the detail page on the error boundary forever (HF itself answers 404). Cache the miss
// as briefly as the real 404 path.
const modelByIdSource = defineParamSource<string, OpenSourceModelEntry | null, OpenSourceModelEntry | null>(
  (id) => cacheKeys.openSourceModel(id),
  {
    ttl: OPEN_SOURCE_MODELS_TTL_MS,
    label: "HuggingFace model",
    served: true,
    scope: { staleCapMs: NEGATIVE_STALE_CAP_MS },
    fetch: (ctx, id) => (isValidHFModelId(id) ? fetchHFModelById(ctx, id) : Promise.resolve(null)),
    parse: (raw) => raw,
    partialWhen: ({ raw }) => (raw == null ? { partial: false, ttl: ONE_MINUTE } : { partial: false }),
  },
);

export async function getOpenSourceModels(
  ctx: AppContext,
  p: OpenSourceModelsQuery,
): Promise<SourcePayload<OpenSourceModelEntry[]>> {
  if (!p.id) return listSource(ctx, p);
  const single = await modelByIdSource(ctx, p.id.trim());
  return {
    data: single.data == null ? [] : [single.data],
    fetchedAt: single.fetchedAt,
    partial: single.partial,
  };
}
