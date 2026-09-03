import { SLOW_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { ArenaRankEntry, ArenaRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra";
import { decodeEntities, stripHtml, tableRowInners } from "@/server/parsers/feed";
import { leadingInt, leadingNumber, moneyAmount, suffixedCount } from "@/server/parsers/primitives";

const LEADERBOARD_PATH = "/leaderboard/text";
/** The text board renders hundreds of rows; cap the served payload. */
const MAX_ROWS = 300;

/**
 * Capability slices served as separate board pages (verified path segments).
 * `overall` backs the Arena tab; the rest back the benchmark tab.
 */
export const ARENA_CATEGORIES = [
  "coding",
  "math",
  "creative-writing",
  "instruction-following",
  "hard-prompts",
] as const;

export type ArenaCategory = (typeof ARENA_CATEGORIES)[number];

function cellTexts(trInner: string): string[] {
  // Split on closing cell tags so nested spans don't collapse cell boundaries.
  return trInner
    .split(/<\/(?:td|th)[^>]*>/gi)
    .map((cell) => decodeEntities(stripHtml(cell)).trim())
    .filter((cell) => cell.length > 0);
}

function titleOf(trInner: string): string | null {
  const m = /<span[^>]*\btitle=([^ >]+)/i.exec(trInner);
  if (!m?.[1]) return null;
  return m[1].replace(/^["']|["']$/g, "").trim() || null;
}

function parseScore(v: string): number | null {
  return leadingNumber(v);
}

function parseMoney(v: string): number | null {
  return moneyAmount(v);
}

function parseMoneyPair(v: string): [number | null, number | null] {
  const parts = v.split("/");
  if (parts.length < 2) return [parseMoney(v), null];
  return [parseMoney(parts[0] ?? ""), parseMoney(parts[1] ?? "")];
}

function parseContextTokens(v: string): number | null {
  return suffixedCount(v);
}

function parseVotes(v: string): number | null {
  // Live rows carry a locale suffix ("27,189票"); take the leading digits.
  return leadingInt(v);
}

const CREATOR_BY_PREFIX: [RegExp, string][] = [
  [/^claude/i, "Anthropic"],
  [/^gpt|^o\d|^chatgpt/i, "OpenAI"],
  [/^gemini/i, "Google"],
  [/^grok/i, "xAI"],
  [/^deepseek/i, "DeepSeek"],
  [/^qwen/i, "Alibaba"],
  [/^kimi/i, "Moonshot AI"],
  [/^(llama|muse)/i, "Meta"],
  [/^mistral|^mixtral|^codestral|^pixtral|^ministral/i, "Mistral"],
  [/^glm/i, "Zhipu AI"],
  [/^ernie/i, "Baidu"],
  [/^command/i, "Cohere"],
  [/^nova/i, "Amazon"],
  [/^phi/i, "Microsoft"],
  [/^granite/i, "IBM"],
  [/^solar/i, "Upstage"],
];

function creatorFor(id: string, name: string): string {
  for (const [re, creator] of CREATOR_BY_PREFIX) if (re.test(id)) return creator;
  const first = name.split(/\s+/)[0]?.trim();
  return first || "Unknown";
}

/**
 * Parse one leaderboard `<tr>` into an entry; null when the row isn't a data row
 * (header rows, skeleton placeholders) or lacks rank/identity.
 * Expected cell order: rank | spread | model | score | votes | price | context.
 */
function parseRank(v: string | undefined): number | null {
  if (v == null) return null;
  const n = Number(v.replace(/,/g, "").trim());
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function parseArenaRow(trInner: string): ArenaRankEntry | null {
  const cells = cellTexts(trInner);
  if (cells.length < 4) return null;
  const rank = parseRank(cells[0]);
  if (rank == null) return null;
  // Model cell is index 2 when the spread column exists, else index 1.
  const modelCell = cells.length >= 7 ? (cells[2] ?? "") : (cells[1] ?? "");
  // Prefer the title attr; fall back to the most slug-like token (stripped text
  // glues spans together, so the last token is often a license like "Proprietary").
  const tokens = modelCell.split(/\s+/).filter(Boolean);
  const slugLike = tokens.find((tok) => tok.includes("-") || tok.includes("/"));
  const id = titleOf(trInner) ?? slugLike ?? tokens[tokens.length - 1] ?? "";
  if (!id) return null;
  const name = modelCell || id;
  const scoreCell = cells.length >= 7 ? (cells[3] ?? "") : (cells[2] ?? "");
  const votesCell = cells.length >= 7 ? (cells[4] ?? "") : (cells[3] ?? "");
  const priceCell = cells.length >= 7 ? (cells[5] ?? "") : "";
  const contextCell = cells.length >= 7 ? (cells[6] ?? "") : "";
  const [priceInput, priceOutput] = parseMoneyPair(priceCell);
  // Low-vote rows carry a "Preliminary" badge between score and votes
  // (e.g. "1537±16Preliminary1,456"); match the raw row so glued text still hits.
  const preliminary = /preliminary/i.test(trInner);
  return {
    rank,
    id,
    name,
    creator: creatorFor(id, name),
    score: parseScore(scoreCell),
    votes: parseVotes(votesCell),
    preliminary,
    priceInput,
    priceOutput,
    contextTokens: contextCell ? parseContextTokens(contextCell) : null,
  };
}

/** Parse the full leaderboard page; pure (unit-tested with a saved row fixture). */
export function parseArenaPage(html: string): ArenaRankEntry[] {
  const rows: ArenaRankEntry[] = [];
  const seen = new Set<string>();
  for (const trInner of tableRowInners(html)) {
    const entry = parseArenaRow(trInner);
    if (!entry || seen.has(entry.id)) continue;
    seen.add(entry.id);
    rows.push(entry);
    if (rows.length >= MAX_ROWS) break;
  }
  return rows.sort((a, b) => a.rank - b.rank);
}

async function fetchArenaBoard(ctx: AppContext, category: string): Promise<ArenaRankEntry[]> {
  const path = category === "overall" ? LEADERBOARD_PATH : `${LEADERBOARD_PATH}/${category}`;
  const html = await ctx.http.text(`${upstreamConfig.arena}${path}`, {
    headers: { accept: "text/html,application/xhtml+xml,*/*" },
    timeoutMs: UPSTREAM_TIMEOUT_MS,
    retries: 1,
  });
  const entries = parseArenaPage(html);
  if (entries.length === 0) throw new UpstreamError(`Arena board "${category}" yielded 0 rows (markup changed?)`);
  return entries;
}

/**
 * Arena human-preference leaderboard (server-rendered table rows).
 * Failures degrade to short TTL so the next tick retries soon.
 */
export const getArenaRankings = (ctx: AppContext): Promise<ArenaRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.arenaRankings, SLOW_TTL_MS, async () => {
    const entries = await fetchArenaBoard(ctx, "overall");
    return { data: { entries, fetchedAt: new Date().toISOString() } };
  });

/** One Arena capability slice (coding / math / ...) for the benchmark tab. */
export const getArenaBoard = (
  ctx: AppContext,
  category: string,
): Promise<{ category: string; entries: ArenaRankEntry[]; fetchedAt: string }> =>
  ctx.cache.withTtl(cacheKeys.arenaBoard(category), SLOW_TTL_MS, async () => {
    if (!(ARENA_CATEGORIES as readonly string[]).includes(category)) {
      throw new ValidationError(`Unknown arena board "${category}"`);
    }
    const entries = await fetchArenaBoard(ctx, category);
    return { data: { category, entries, fetchedAt: new Date().toISOString() } };
  });
