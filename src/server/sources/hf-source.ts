import { isValidRowId } from "@/server/parsers/parser-primitives";
import { MAX_NAME_CHARS, ONE_MINUTE, SLOW_TTL_MS } from "@/shared/config";
import { upstreamConfig, cacheKeys } from "@/server/config";
import type { OpenSourceModelEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra/errors";
import { dedupeBy } from "@/shared/utils";
import { encodeModelIdPath } from "@/shared/utils/models";
import { LicenseDropTally, keepOpenSourceRanking, mapListModel, mapModel } from "@/server/parsers/hf-parser";
import type { HFModel } from "@/server/parsers/upstream-types";

import type { SourcePayload } from "@/shared/types";
import { cachedPayload, requireArrayBody, requireRows } from "@/server/sources/pipeline";
import { logPartial } from "@/server/infra/logger";

export interface ModelQuery {
  sort: string;
  direction: string;
}

const HF_API = upstreamConfig.huggingface;
const HF_MODEL_ID_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,96}(?:\/[A-Za-z0-9][A-Za-z0-9._-]{0,96})?$/;
function isValidHFModelId(value: string): boolean {
  return value.length <= MAX_NAME_CHARS && isValidRowId(value) && HF_MODEL_ID_RE.test(value);
}

const HF_LIST_FIELDS = ["author", "downloads", "likes", "tags", "pipeline_tag", "createdAt", "lastModified"];

// HF paginates via `Link: <...cursor=...>; rel="next"`. Page size 100 keeps
// each upstream response small; pagination stops at the safety ceiling so a
// single invocation cannot exhaust the Workers subrequest budget.
const HF_PAGE_LIMIT = 100;
const HF_MAX_PAGES = 30;
const HF_MAX_RAW_ROWS = HF_PAGE_LIMIT * HF_MAX_PAGES;
// Homepage only needs a small slice for its cards, so it does one cheap page
// instead of the full paginated walk used by the public list endpoint.
const HF_TOP_PAGE_LIMIT = 200;

interface HFRaw {
  items: HFModel[];
  pageCount: number;
  truncated: boolean;
}

function hfListUrl(p: ModelQuery, limit: number): string {
  const params = new URLSearchParams({ sort: p.sort, direction: p.direction, limit: String(limit) });
  for (const field of HF_LIST_FIELDS) params.append("expand[]", field);
  return `${HF_API}?${params.toString()}`;
}

async function fetchHFPage(ctx: AppContext, url: string): Promise<{ items: HFModel[]; nextUrl: string | null }> {
  const page = await ctx.http.getJsonPage<unknown>(url);
  const items = requireArrayBody(url, page.data, "HuggingFace") as HFModel[];
  return { items, nextUrl: page.nextUrl };
}

async function fetchHFModelsAll(ctx: AppContext, p: ModelQuery): Promise<HFRaw> {
  const items: HFModel[] = [];
  let url: string | null = hfListUrl(p, HF_PAGE_LIMIT);
  let pageCount = 0;
  let truncated = false;
  while (url != null) {
    const page = await fetchHFPage(ctx, url);
    pageCount += 1;
    for (const item of page.items) {
      if (items.length >= HF_MAX_RAW_ROWS) break;
      items.push(item);
    }
    if (items.length >= HF_MAX_RAW_ROWS) {
      truncated = page.nextUrl != null || page.items.length >= HF_PAGE_LIMIT;
      break;
    }
    if (page.items.length < HF_PAGE_LIMIT) break;
    url = page.nextUrl;
    if (url != null && pageCount >= HF_MAX_PAGES) {
      truncated = true;
      break;
    }
    if (pageCount >= HF_MAX_PAGES) {
      truncated = url != null;
      break;
    }
  }
  return { items, pageCount, truncated };
}

async function fetchHFTopPage(ctx: AppContext, p: ModelQuery): Promise<HFRaw> {
  const url = hfListUrl(p, HF_TOP_PAGE_LIMIT);
  const { items } = await fetchHFPage(ctx, url);
  return { items, pageCount: 1, truncated: false };
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
  if (dropped > 0) logPartial(ctx.log, "huggingface", { dropped, total: items.length });
  return bucket;
}

export const getModels = (ctx: AppContext, p: ModelQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  cachedPayload<OpenSourceModelEntry[]>(
    ctx,
    cacheKeys.openSourceModels(p.sort, p.direction),
    SLOW_TTL_MS,
    async (refreshCtx) => {
      const raw = await fetchHFModelsAll(refreshCtx, p);
      const rows = parseHFItems(raw.items, refreshCtx);
      if (raw.truncated) {
        // Safety ceiling, not a source failure: upstream served every page we
        // asked for; we simply stopped paginating. Keep partial=false so the
        // UI doesn't report "incomplete data" for a healthy response.
        refreshCtx.log("info", "[huggingface] pagination stopped at safety ceiling", {
          pages: raw.pageCount,
          raw: raw.items.length,
          ceiling: HF_MAX_RAW_ROWS,
        });
      }
      return { rows };
    },
  );

export const getTopModels = (ctx: AppContext, p: ModelQuery): Promise<SourcePayload<OpenSourceModelEntry[]>> =>
  cachedPayload<OpenSourceModelEntry[]>(
    ctx,
    cacheKeys.openSourceModelsTop(p.sort, p.direction),
    SLOW_TTL_MS,
    async (refreshCtx) => {
      const raw = await fetchHFTopPage(refreshCtx, p);
      const rows = parseHFItems(raw.items, refreshCtx);
      return { rows };
    },
  );

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
    { memoryOnly: true, staleCapMs: NEGATIVE_STALE_CAP_MS },
  );
};
