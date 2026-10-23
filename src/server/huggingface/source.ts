import { isValidRowId } from "@/server/formats/parser-primitives";
import { MAX_MODEL_ID_CHARS, ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { upstreamConfig } from "@/server/upstream/upstream";
import { cacheKeys } from "@/server/cache/keys";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { UpstreamError, ValidationError, isTimeoutLike, rethrowIfClientAbort } from "@/server/api/errors";
import { dedupeBy, errMsg } from "@/shared/utils";
import { encodeModelIdPath } from "@/shared/utils/models";
import { LicenseDropTally, keepOpenSourceRanking, mapListModel, mapModel } from "./parse";
import type { HFModel } from "@/server/formats/wire-types";

import type { SourcePayload } from "@/shared/types";
import type { OpenSourceModelsQuery } from "@/shared/query-schemas";
import { cachedPayload, defineParamSource, requireArrayBody, requireRows } from "@/server/pipeline";

const HF_API = upstreamConfig.huggingface;
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;
function isValidHFModelId(value: string): boolean {
  return value.length <= MAX_MODEL_ID_CHARS && isValidRowId(value) && HF_MODEL_ID_RE.test(value);
}

const HF_LIST_FIELDS = ["author", "downloads", "likes", "tags", "pipeline_tag", "createdAt", "lastModified"];

// HF serves up to 1000 rows per response, so a single page replaces the ten a limit of 100 needed. That keeps one
// refresh at one or two subrequests (and one or two round trips) instead of ten to fifteen against the invocation's
// 50-subrequest and connection budget. A page of 1000 weighs ~0.5 MB, well inside MAX_JSON_BYTES.
const HF_PAGE_LIMIT = 1000;

// Raw-row ceilings (pages × HF_PAGE_LIMIT). The list is trendingScore-ordered, so these only set how deep the tail
// goes: 2000 rows leave ~1200 after the license and download gates, while the home card aggregates a task
// distribution and needs a wide sample rather than the full list.
const HF_MAX_PAGES = 2;
const HOME_HF_MAX_PAGES = 1;

// A healthy list page answers in ~1.3 s, so the 12 s interactive default would let two attempts on the first page eat
// most of INFLIGHT_HANG_GUARD_MS (30 s) and drop the whole refresh instead of degrading it.
const HF_PAGE_TIMEOUT_MS = 8_000;

// Pages must not stack their timeouts either: past this wall clock the pagination stops with the rows it already has
// and reports the list as partial. The value sits below the hang guard minus one page timeout, so this check always
// wins the race and the refresh degrades instead of being killed.
const HF_PAGINATION_BUDGET_MS = 18_000;

interface HFRaw {
  items: HFModel[];
  pageCount: number;
  truncated: boolean;
  incomplete: boolean;
}

interface HFPage {
  items: HFModel[];
  nextUrl: string | null;
}

function hfListUrl(sort: string, limit: number): string {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  for (const field of HF_LIST_FIELDS) params.append("expand[]", field);
  return `${HF_API}?${params.toString()}`;
}

async function fetchHFPage(ctx: AppContext, url: string, first: boolean): Promise<HFPage> {
  // Only the first page is worth a retry: a later failure still leaves usable rows for a partial response.
  const page = await ctx.http.getJsonPage<unknown>(url, {
    timeoutMs: HF_PAGE_TIMEOUT_MS,
    retries: first ? 1 : 0,
  });
  const items = requireArrayBody<HFModel>(url, page.data, "HuggingFace");
  return { items, nextUrl: page.nextUrl };
}

function logCeiling(ctx: AppContext, pageCount: number, raw: number, maxRawRows: number): void {
  ctx.log("info", "[huggingface] pagination stopped at safety ceiling", {
    pages: pageCount,
    raw,
    ceiling: maxRawRows,
  });
}

async function fetchHFModels(ctx: AppContext, sort: string, maxPages: number): Promise<HFRaw> {
  const startedAt = Date.now();
  const items: HFModel[] = [];
  let url: string | null = hfListUrl(sort, HF_PAGE_LIMIT);
  let pageCount = 0;
  let truncated = false;
  const maxRawRows = HF_PAGE_LIMIT * maxPages;
  while (url != null) {
    if (pageCount > 0 && Date.now() - startedAt > HF_PAGINATION_BUDGET_MS) {
      ctx.log("warn", `[huggingface] pagination budget spent after ${pageCount} page(s), using ${items.length} rows`);
      return { items, pageCount, truncated: true, incomplete: true };
    }
    let page: HFPage;
    try {
      page = await fetchHFPage(ctx, url, pageCount === 0);
    } catch (err) {
      rethrowIfClientAbort(err);
      if (items.length === 0) throw err;
      if (isTimeoutLike(err)) {
        ctx.log(
          "warn",
          `[huggingface] pagination stopped early after ${pageCount} pages, using ${items.length} rows: ${errMsg(err)}`,
        );
        return { items, pageCount, truncated: true, incomplete: true };
      }
      throw err;
    }
    pageCount += 1;
    for (const item of page.items) {
      if (items.length >= maxRawRows) break;
      items.push(item);
    }
    if (items.length >= maxRawRows) {
      truncated = page.nextUrl != null || page.items.length >= HF_PAGE_LIMIT;
      logCeiling(ctx, pageCount, items.length, maxRawRows);
      break;
    }
    if (page.items.length < HF_PAGE_LIMIT) break;
    url = page.nextUrl;
    if (pageCount >= maxPages) {
      truncated = url != null;
      logCeiling(ctx, pageCount, items.length, maxRawRows);
      break;
    }
  }
  return { items, pageCount, truncated, incomplete: false };
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

function parseHFItems(items: HFModel[], ctx: AppContext): OpenSourceModelEntry[] {
  const tally = new LicenseDropTally();
  const kept = items
    .map((m) => mapListModel(m, tally))
    .filter((m): m is OpenSourceModelEntry => m !== null && m.license != null && keepOpenSourceRanking(m, tally));
  logLicenseDrops(ctx, items.length, tally);
  const bucket = dedupeBy(kept, (m) => m.id);
  requireRows(bucket, "HuggingFace", "usable models", `raw=${items.length}, kept=0`);
  const dropped = items.length - kept.length;
  if (dropped > 0) {
    ctx.log("info", `[huggingface] filtered ${dropped}/${items.length} rows (non-open license or zero downloads)`);
  }
  return bucket;
}

// Reaching the page ceiling is by design: it bounds one invocation's subrequest/timeout budget and always yields the
// same top-N ranking, so it is not a degradation. Only an aborted fetch or an exhausted pagination budget leaves the
// list genuinely incomplete, and only that is reported as partial.
function hfListSource(maxPages: number, keyOf: (params: OpenSourceModelsQuery) => string) {
  return defineParamSource<OpenSourceModelsQuery, HFRaw, OpenSourceModelEntry>(keyOf, {
    ttl: SLOW_TTL_MS,
    label: "HuggingFace",
    fetch: (ctx, params) => fetchHFModels(ctx, params.sort, maxPages),
    parse: (raw, ctx) => parseHFItems(raw.items, ctx),
    partialWhen: ({ raw }) => ({ partial: raw.incomplete }),
  });
}

// The ranking list and the home dashboard sample the same upstream list at different depths, and cache it separately.
const fullListSource = hfListSource(HF_MAX_PAGES, (params) => cacheKeys.openSourceModels(params.sort));
const homeListSource = hfListSource(HOME_HF_MAX_PAGES, (params) => cacheKeys.homeOpenSource(params.sort));

export const getModels = (ctx: AppContext, p: OpenSourceModelsQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  fullListSource(ctx, p);

export const getHomeOpenSourceModels = (
  ctx: AppContext,
  p: OpenSourceModelsQuery,
): Promise<SourcePayload<OpenSourceModelEntry[]>> => homeListSource(ctx, p);

async function fetchHFModelById(ctx: AppContext, id: string): Promise<OpenSourceModelEntry | null> {
  const encoded = encodeModelIdPath(id);
  let raw: HFModel;
  try {
    raw = await ctx.http.getJson<HFModel>(`${HF_API}/${encoded}`);
  } catch (err) {
    if (err instanceof UpstreamError && err.statusCode === 404) return null;
    throw err;
  }
  return mapModel(raw);
}

const NEGATIVE_STALE_CAP_MS = 5 * ONE_MINUTE;

export const getModelById = (ctx: AppContext, id: string): Promise<SourcePayload<OpenSourceModelEntry | null>> => {
  const trimmed = id.trim();
  if (!isValidHFModelId(trimmed)) {
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
    { staleCapMs: NEGATIVE_STALE_CAP_MS },
  );
};

export async function getModelsForQuery(
  ctx: AppContext,
  p: OpenSourceModelsQuery,
): Promise<SourcePayload<OpenSourceModelEntry[]>> {
  if (!p.id) return getModels(ctx, p);
  const single = await getModelById(ctx, p.id);
  return {
    data: single.data == null ? [] : [single.data],
    fetchedAt: single.fetchedAt,
    partial: single.partial,
  };
}
