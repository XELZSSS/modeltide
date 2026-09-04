import { STATIC_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, ttlForCount, upstreamConfig } from "@/shared/config";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, errMsg } from "@/server/infra";
import { decodeEntities, stripHtml } from "@/server/parsers/feed";
import { isoDate } from "@/server/parsers/primitives";
import {
  isChallengePage,
  isClosedSourceRow,
  isValidClosedRelease,
} from "@/server/sources/data-filter";

const MODELS_PATH = "/models/";
/** Newest-first SSR pages; each page holds 50 models of all sources. */
const MAX_PAGES = 6;
const FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

interface Cell {
  attrs: string;
  inner: string;
}

function rowCellsWithAttrs(trInner: string): Cell[] {
  const cells: Cell[] = [];
  for (const m of trInner.matchAll(/<t[dh]([^>]*)>([\s\S]*?)<\/t[dh]>/gi)) {
    cells.push({ attrs: m[1] ?? "", inner: m[2] ?? "" });
  }
  return cells;
}

function sortValue(attrs: string): string | null {
  const m = /data-sort-value="([^"]*)"/.exec(attrs);
  return m?.[1] ?? null;
}

function cellText(inner: string): string {
  return decodeEntities(stripHtml(inner)).trim();
}

function slugFromModelCell(inner: string): string | null {
  const m = /href="\/models\/([^"/]+)\/"/.exec(inner);
  return m?.[1]?.trim() || null;
}

function releaseFromSortValue(v: string | null): string | null {
  if (!v) return null;
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(v.trim());
  if (!m?.[1] || !m?.[2] || !m?.[3]) return null;
  const iso = `${m[1]}-${m[2]}-${m[3]}`;
  return isoDate(iso);
}

/**
 * Parse one `<tr>`; null for non-closed or unusable rows.
 * Cell order: model | family | developer | source | release | benchmarks | eci | input | output.
 */
export function parseBenchmarkListRow(trAttrs: string, trInner: string): ClosedReleaseEntry | null {
  if (!isClosedSourceRow(trAttrs)) return null;
  const cells = rowCellsWithAttrs(trInner);
  if (cells.length < 5) return null;

  const modelCell = cells[0]!;
  const slug = slugFromModelCell(modelCell.inner);

  const name = sortValue(modelCell.attrs)?.trim() || cellText(modelCell.inner).split("\n")[0]?.trim();

  const releaseCell = cells[4]!;
  const releaseText = cellText(releaseCell.inner);
  const releaseDate = isoDate(releaseText) ?? releaseFromSortValue(sortValue(releaseCell.attrs));
  // Unified dirty/invalid/unsuitable gate (slug + name + date).
  if (!isValidClosedRelease(slug, name, releaseDate)) return null;
  const validSlug = slug as string;
  const validName = name as string;
  const validDate = releaseDate as string;

  const provider = sortValue(cells[2]!.attrs)?.trim() || cellText(cells[2]!.inner) || "Unknown";
  const day = validDate.length > 10 ? validDate.slice(0, 10) : validDate;

  const benchmarksText = cells.length > 5 ? cellText(cells[5]!.inner) : "";
  const benchmarks = /^\d+$/.test(benchmarksText) ? benchmarksText : sortValue(cells[5]?.attrs ?? "");
  const notes = benchmarks && /^\d+$/.test(benchmarks) ? `${benchmarks} benchmarks` : "";

  return {
    id: validSlug,
    model: validName,
    provider,
    releaseDate: day,
    notes,
    link: `${upstreamConfig.benchmarkList}/models/${validSlug}/`,
  };
}

/** Parse a full directory page; pure. Closed rows only, deduped by slug. */
export function parseBenchmarkListPage(html: string): ClosedReleaseEntry[] {
  if (isChallengePage(html)) throw new UpstreamError("BenchmarkList returned a challenge page");
  const seen = new Set<string>();
  const entries: ClosedReleaseEntry[] = [];
  for (const m of html.matchAll(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi)) {
    let entry: ClosedReleaseEntry | null;
    try {
      entry = parseBenchmarkListRow(m[1] ?? "", m[2] ?? "");
    } catch {
      continue;
    }
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    entries.push(entry);
  }
  return entries;
}

function pageUrl(page: number): string {
  return page <= 1
    ? `${upstreamConfig.benchmarkList}${MODELS_PATH}`
    : `${upstreamConfig.benchmarkList}${MODELS_PATH}page/${page}/`;
}

/**
 * Closed-source releases from the BenchmarkList model directory
 * (`data-filter-source="closed_api"` rows, newest first).
 * Sole upstream — failures surface as 502 with stale-cache fallback.
 */
export const getClosedReleases = (ctx: AppContext): Promise<ClosedReleaseEntry[]> =>
  ctx.cache.withTtl(cacheKeys.closedReleases, STATIC_TTL_MS, async () => {
    const settled = await Promise.allSettled(
      Array.from({ length: MAX_PAGES }, (_, i) =>
        ctx.http
          .text(pageUrl(i + 1), {
            headers: { accept: "text/html,application/xhtml+xml,*/*" },
            ...FETCH_OPTS,
          })
          .then(parseBenchmarkListPage),
      ),
    );
    const failed: string[] = [];
    const seen = new Set<string>();
    const entries: ClosedReleaseEntry[] = [];
    settled.forEach((r, i) => {
      if (r.status === "fulfilled") {
        for (const e of r.value) {
          if (seen.has(e.id)) continue;
          seen.add(e.id);
          entries.push(e);
        }
      } else {
        failed.push(`page/${i + 1}`);
        ctx.log("warn", `[closed-releases] page ${i + 1} failed: ${errMsg(r.reason)}`);
      }
    });
    // Newest first; directory pages arrive newest-first but merges can interleave.
    entries.sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));
    if (entries.length === 0) {
      throw new UpstreamError(`BenchmarkList models yielded 0 closed releases (${failed.join(", ") || "empty pages"})`);
    }
    return { data: entries, ttl: ttlForCount(failed.length, STATIC_TTL_MS) };
  });
