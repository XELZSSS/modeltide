import {
  isRecord,
  isoDate,
  numCoerce,
  numIntCoerceNonNegative,
  strOrNull,
  isSuitableNewsItem,
  isValidRowId,
} from "@/server/parsers/parser-primitives";
import type { NewsItem, OpenSourceModelEntry } from "@/shared/types";
import { SOURCE_LIMITS } from "@/server/config/limits";
import { upstreamConfig } from "@/server/config";
import { zeroUpstreamMessage } from "@/server/infra/errors";
import { getOpenLicenseId, isRecognizedNonOpenLicense, licenseTagId } from "@/server/parsers/licenses";
import type { DailyPaperEntry, HFModel } from "@/server/parsers/upstream-types";
import { parseFail, parseOk, type ParseResult } from "@/server/parsers/parse-result";
import { stripHtml } from "@/server/parsers/html-to-text";
import { decodeEntities } from "@/server/parsers/html-entities";

function resolveAuthor(m: HFModel, id: string): string | null {
  return strOrNull(m.author) ?? (id.split("/")[0]?.trim() || null);
}

interface LicenseDrops {
  withoutTag: number;
  declaredNonOpen: number;
  unknownTags: string[];
}

const MAX_UNKNOWN_LICENSE_TAGS = 5;

export class LicenseDropTally {
  private withoutTag = 0;
  private declaredNonOpen = 0;
  private readonly unknownTags = new Set<string>();

  record(ids: readonly string[], license: string | null): void {
    if (ids.length === 0) {
      this.withoutTag += 1;
      return;
    }
    if (license != null) return;
    this.declaredNonOpen += 1;
    for (const id of ids) {
      if (isRecognizedNonOpenLicense(id) || this.unknownTags.has(id)) continue;
      if (this.unknownTags.size >= MAX_UNKNOWN_LICENSE_TAGS) break;
      this.unknownTags.add(id);
    }
  }

  drops(): LicenseDrops {
    return { withoutTag: this.withoutTag, declaredNonOpen: this.declaredNonOpen, unknownTags: [...this.unknownTags] };
  }
}

export function mapModel(m: unknown): OpenSourceModelEntry | null {
  return toEntry(m, true);
}

export function mapListModel(m: unknown, tally?: LicenseDropTally): OpenSourceModelEntry | null {
  return toEntry(m, false, tally);
}

export function keepOpenSourceRanking(m: { downloads: number }): boolean {
  return Number.isFinite(m.downloads) && m.downloads > 0;
}

function toEntry(m: unknown, includeTags: boolean, tally?: LicenseDropTally): OpenSourceModelEntry | null {
  if (!isRecord(m)) return null;
  const model = m as HFModel;
  if (!isValidRowId(model.id)) return null;
  const id = (model.id as string).trim();
  const downloads = numIntCoerceNonNegative(model.downloads) ?? 0;
  const likes = numIntCoerceNonNegative(model.likes) ?? 0;
  const tags = Array.isArray(model.tags) ? model.tags.filter((t): t is string => typeof t === "string") : [];
  const licenseIds = tags.map(licenseTagId).filter((licenseId): licenseId is string => licenseId != null);
  const license = getOpenLicenseId(licenseIds);
  tally?.record(licenseIds, license);
  const entry: OpenSourceModelEntry = {
    id,
    author: resolveAuthor(model, id),
    downloads,
    likes,
    license,
    task: strOrNull(model.pipeline_tag),
    createdAt: isoDate(model.createdAt),
    lastModified: isoDate(model.lastModified),
  };
  if (includeTags) entry.tags = tags.slice(0, 100);
  return entry;
}

function toNewsItem(entry: unknown): NewsItem | null {
  if (!isRecord(entry)) return null;
  const paper = isRecord((entry as DailyPaperEntry).paper) ? (entry as DailyPaperEntry).paper! : undefined;
  const rawId = strOrNull(paper?.id);
  const rawTitle = typeof paper?.title === "string" ? paper.title : "";
  const title = stripHtml(decodeEntities(rawTitle));
  const publishedAt = typeof paper?.publishedAt === "string" ? paper.publishedAt.trim() : "";
  if (!rawId || !title || !Number.isFinite(Date.parse(publishedAt))) return null;
  if (!isValidRowId(rawId)) return null;
  const link = `${upstreamConfig.huggingfaceSite}/papers/${encodeURIComponent(rawId)}`;
  if (!isSuitableNewsItem(title, link)) return null;
  return {
    id: `hf-paper-${rawId}`,
    title,
    link,
    pubDate: publishedAt,
    source: "Hugging Face Papers",
  };
}

export function parseDailyPapers(raw: unknown): ParseResult<NewsItem[]> {
  if (!Array.isArray(raw)) {
    return parseFail(`HuggingFace daily papers returned non-array (got ${raw === null ? "null" : typeof raw})`);
  }
  const ranked = raw
    .slice(0, 500)
    .map((entry) => ({ entry, upvotes: upvotesOf(entry) }))
    .sort((a, b) => b.upvotes - a.upvotes);
  const items: NewsItem[] = [];
  const seen = new Set<string>();
  for (const { entry } of ranked) {
    const item = toNewsItem(entry);
    if (!item || seen.has(item.id)) continue;
    seen.add(item.id);
    items.push(item);
    if (items.length >= SOURCE_LIMITS.dailyPapers) break;
  }
  if (items.length === 0) {
    return parseFail(zeroUpstreamMessage("HuggingFace daily papers", "usable items", `raw=${raw.length}`));
  }
  return parseOk(items);
}

function upvotesOf(entry: unknown): number {
  if (!isRecord(entry)) return -1;
  const v = (entry as DailyPaperEntry).paper;
  const up = isRecord(v) ? (v as { upvotes?: unknown }).upvotes : (entry as { upvotes?: unknown }).upvotes;
  return numCoerce(up) ?? -1;
}
