import { isValidRowId } from "@/server/formats/parser-primitives";
import { MAX_NAME_CHARS, ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { upstreamConfig } from "@/server/upstream/upstream";
import { cacheKeys } from "@/server/cache/keys";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/api/context";
import { ClientAbortError, UpstreamError, ValidationError, isTimeoutLike } from "@/server/api/errors";
import { dedupeBy, errMsg } from "@/shared/utils";
import { encodeModelIdPath } from "@/shared/utils/models";
import { LicenseDropTally, keepOpenSourceRanking, mapListModel, mapModel } from "./parse";
import type { HFModel } from "@/server/formats/wire-types";

import type { SourcePayload } from "@/shared/types";
import type { OpenSourceModelsQuery } from "@/shared/query-schemas";
import { cachedPayload, requireArrayBody, requireRows } from "@/server/pipeline";

const HF_API = upstreamConfig.huggingface;
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;
function isValidHFModelId(value: string): boolean {
  return value.length <= MAX_NAME_CHARS && isValidRowId(value) && HF_MODEL_ID_RE.test(value);
}

const HF_LIST_FIELDS = ["author", "downloads", "likes", "tags", "pipeline_tag", "createdAt", "lastModified"];

// HF paginates via `Link: rel="next"`; these caps keep one invocation inside the Workers subrequest + timeout budget.
const HF_PAGE_LIMIT = 100;
const HF_MAX_PAGES = 15;

// Home dashboard needs only a sample; the full list exceeds the 35s cold-cache client timeout.
const HOME_HF_MAX_PAGES = 5;

interface HFRaw {
  items: HFModel[];
  pageCount: number;
  truncated: boolean;
  incomplete: boolean;
}

function hfListUrl(sort: string, limit: number): string {
  const params = new URLSearchParams({ sort, limit: String(limit) });
  for (const field of HF_LIST_FIELDS) params.append("expand[]", field);
  return `${HF_API}?${params.toString()}`;
}

async function fetchHFPage(ctx: AppContext, url: string): Promise<{ items: HFModel[]; nextUrl: string | null }> {
  const page = await ctx.http.getJsonPage<unknown>(url);
  const items = requireArrayBody(url, page.data, "HuggingFace") as HFModel[];
  return { items, nextUrl: page.nextUrl };
}

async function fetchHFModelsAll(ctx: AppContext, sort: string, maxPages: number): Promise<HFRaw> {
  const items: HFModel[] = [];
  let url: string | null = hfListUrl(sort, HF_PAGE_LIMIT);
  let pageCount = 0;
  let truncated = false;
  const maxRawRows = HF_PAGE_LIMIT * maxPages;
  while (url != null) {
    let page: { items: HFModel[]; nextUrl: string | null };
    try {
      page = await fetchHFPage(ctx, url);
    } catch (err) {
      // Keep the pages already fetched on abort/timeout: a degraded payload beats a failed leg.
      if (items.length === 0) throw err;
      if (err instanceof ClientAbortError || isTimeoutLike(err)) {
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
      break;
    }
    if (page.items.length < HF_PAGE_LIMIT) break;
    url = page.nextUrl;
    if (pageCount >= maxPages) {
      truncated = url != null;
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
    // Intentional filtering, not missing data: log at info so it isn't a partial-data warning.
    ctx.log("info", `[huggingface] filtered ${dropped}/${items.length} rows (non-open license or zero downloads)`);
  }
  return bucket;
}

async function loadHFModels(
  ctx: AppContext,
  sort: string,
  maxPages: number,
): Promise<{ rows: OpenSourceModelEntry[]; incomplete: boolean; pageCount: number; rawCount: number }> {
  const raw = await fetchHFModelsAll(ctx, sort, maxPages);
  const rows = parseHFItems(raw.items, ctx);
  if (raw.truncated) {
    // Safety ceiling, not a source failure: keep partial=false so the UI doesn't report incomplete data.
    ctx.log("info", "[huggingface] pagination stopped at safety ceiling", {
      pages: raw.pageCount,
      raw: raw.items.length,
      ceiling: HF_PAGE_LIMIT * maxPages,
    });
  }
  return { rows, incomplete: raw.incomplete, pageCount: raw.pageCount, rawCount: raw.items.length };
}

export const getModels = (ctx: AppContext, p: OpenSourceModelsQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  cachedPayload<OpenSourceModelEntry[]>(ctx, cacheKeys.openSourceModels(p.sort), SLOW_TTL_MS, async (refreshCtx) => {
    const { rows, incomplete } = await loadHFModels(refreshCtx, p.sort, HF_MAX_PAGES);
    return { rows, partial: incomplete };
  });

// Home slice: own cache key (must not pollute the full-list key) and a small page budget to fit the client timeout.
export const getHomeOpenSourceModels = (
  ctx: AppContext,
  p: OpenSourceModelsQuery,
): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  cachedPayload<OpenSourceModelEntry[]>(ctx, cacheKeys.homeOpenSource(p.sort), SLOW_TTL_MS, async (refreshCtx) => {
    const { rows, incomplete } = await loadHFModels(refreshCtx, p.sort, HOME_HF_MAX_PAGES);
    return { rows, partial: incomplete };
  });

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
    // Memory-only: ids are caller-supplied, so persisting them would burn the KV write quota.
    { memoryOnly: true, staleCapMs: NEGATIVE_STALE_CAP_MS },
  );
};
