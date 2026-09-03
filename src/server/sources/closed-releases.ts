import { STATIC_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { ClosedReleaseEntry } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, errMsg } from "@/server/infra";
import { getIntelligenceIndex } from "@/server/sources/artificial-analysis";
import { normalizeModelKey, toStringOrNull } from "@/shared/utils";

const CHANGELOG_PATH = "/changelog";
const FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

// Marker as it appears in the raw HTML: single-level \" escaping inside the
// Next.js flight string. The trailing `[` opens the entries array.
// (String.raw: the backslashes below are literal — in a normal string literal
// \" would collapse to just " and the marker would never match.)
const INITIAL_DATA_MARKER = String.raw`"initialData\":{\"data\":[`;

interface RawChangelogModel {
  name?: unknown;
  slug?: unknown;
  intelligenceIndex?: unknown;
  creator?: unknown;
}

interface RawChangelogEntry {
  id?: unknown;
  dateLa?: unknown;
  type?: unknown;
  title?: unknown;
  subtitle?: unknown;
  model?: unknown;
}

function isValidDate(value: string): boolean {
  const ts = Date.parse(value);
  return Number.isFinite(ts);
}

/** Model-page slugs are path segments; reject anything that could break the URL. */
function isSafeSlug(slug: string): boolean {
  return /^[A-Za-z0-9_-]+$/.test(slug);
}

/**
 * Extract the changelog `initialData.data` array from page HTML. The JSON sits
 * single-escaped inside a flight string, so bracket-match over the raw text
 * treating `\"` as an escaped char, then unescape only `\"`/`\\` (leaving
 * `\n` & friends valid for JSON.parse). Tries every marker occurrence and
 * concatenates successes — never throws. Pure (unit-tested).
 */
export function extractInitialData(html: string): unknown[] {
  const out: unknown[] = [];
  let from = 0;
  while (true) {
    const at = html.indexOf(INITIAL_DATA_MARKER, from);
    if (at === -1) break;
    from = at + 1;
    let depth = 0;
    let inString = false;
    let i = at + INITIAL_DATA_MARKER.length - 1; // position of `[`
    for (; i < html.length; i++) {
      const ch = html[i];
      if (ch === "\\") {
        i++;
        continue;
      }
      if (ch === '"') {
        inString = !inString;
        continue;
      }
      if (inString) continue;
      if (ch === "[") depth++;
      else if (ch === "]") {
        depth--;
        if (depth === 0) break;
      }
    }
    if (depth !== 0) continue;
    try {
      const parsed: unknown = JSON.parse(
        html.slice(at + INITIAL_DATA_MARKER.length - 1, i + 1).replace(/\\([\\"])/g, "$1"),
      );
      if (Array.isArray(parsed)) out.push(...parsed);
    } catch {
      // Malformed chunk — try the next marker occurrence, if any.
    }
  }
  return out;
}

/**
 * Keep modelAdded rows for closed-source models. Open-weight filtering reuses
 * our own (cached) intelligence index via `openKeys`: exact slugs plus loose
 * normalized keys, so index/model naming drift doesn't leak open models in.
 * Unmatched entries are kept — the changelog announces index additions, and a
 * leaked open model is still worse than a missed closed one, but an empty
 * open-set (index fetch failed) must not nuke the whole board. Pure (unit-tested).
 */
export function parseChangelogEntries(data: unknown, openKeys: Set<string>): ClosedReleaseEntry[] {
  if (!Array.isArray(data)) return [];
  const seen = new Set<string>();
  const entries: ClosedReleaseEntry[] = [];
  for (const item of data) {
    const row = (item ?? {}) as RawChangelogEntry;
    if (row.type !== "modelAdded") continue;
    const model = (row.model ?? {}) as RawChangelogModel;
    const id = toStringOrNull(row.id);
    const name = toStringOrNull(model.name);
    const slug = toStringOrNull(model.slug);
    const date = toStringOrNull(row.dateLa);
    const creator = toStringOrNull((model.creator as { name?: unknown } | null | undefined)?.name);
    if (!id || !name || !slug || !date || !isValidDate(date) || !creator) continue;
    if (!isSafeSlug(slug)) continue;
    if (seen.has(id)) continue;
    if (openKeys.has(slug) || openKeys.has(normalizeModelKey(slug)) || openKeys.has(normalizeModelKey(name))) continue;
    seen.add(id);
    entries.push({
      id,
      model: name,
      provider: creator,
      releaseDate: date,
      notes: toStringOrNull(row.title) ?? toStringOrNull(row.subtitle) ?? "",
      link: `${upstreamConfig.artificialAnalysis}/models/${slug}`,
    });
  }
  // Newest first; the upstream feed already arrives in this order, re-sort
  // defensively since FeedEntry rendering assumes descending ts.
  return entries.sort((a, b) => Date.parse(b.releaseDate) - Date.parse(a.releaseDate));
}

/**
 * Closed-source frontier releases from the Artificial Analysis changelog —
 * same upstream family as the rankings, so release coverage matches what the
 * rest of the dashboard knows about. Open-weight rows are filtered against
 * the (cached) intelligence index; if that cross-check fails the board
 * degrades to unfiltered rather than going empty.
 */
export const getClosedReleases = (ctx: AppContext): Promise<ClosedReleaseEntry[]> =>
  ctx.cache.withTtl(cacheKeys.closedReleases, STATIC_TTL_MS, async () => {
    const [htmlRes, indexRes] = await Promise.allSettled([
      ctx.http.text(`${upstreamConfig.artificialAnalysis}${CHANGELOG_PATH}`, {
        headers: { accept: "text/html,application/xhtml+xml,*/*" },
        ...FETCH_OPTS,
      }),
      getIntelligenceIndex(ctx),
    ]);
    if (htmlRes.status === "rejected") {
      throw new UpstreamError(`AA changelog fetch failed: ${errMsg(htmlRes.reason)}`);
    }
    let openKeys = new Set<string>();
    if (indexRes.status === "fulfilled") {
      openKeys = new Set(
        indexRes.value.flatMap((m) =>
          m.is_open_weights === true
            ? [m.slug, normalizeModelKey(m.slug), normalizeModelKey(m.name)].filter(Boolean)
            : [],
        ),
      );
    } else {
      ctx.log("warn", `[closed-releases] index cross-check failed: ${errMsg(indexRes.reason)}`);
    }
    const entries = parseChangelogEntries(extractInitialData(htmlRes.value), openKeys);
    if (entries.length === 0) throw new UpstreamError("AA changelog yielded 0 model entries");
    return { data: entries, ttl: STATIC_TTL_MS };
  });
