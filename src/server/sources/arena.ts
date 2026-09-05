import { SLOW_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, upstreamConfig } from "@/shared/config";
import type { ArenaRankEntry, ArenaRankingsPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, ValidationError } from "@/server/infra";
import { decodeEntities, tableRowInners, rowCells } from "@/server/parsers/feed";
import { leadingInt, leadingNumber, moneyAmount, suffixedCount } from "@/server/parsers/primitives";
import { isValidArenaRow } from "@/server/sources/data-filter";

const LEADERBOARD_PATH = "/leaderboard/text";
const MAX_ROWS = 300;

/** Capability slices served as separate board pages. */
export const ARENA_CATEGORIES = [
  "coding",
  "math",
  "creative-writing",
  "instruction-following",
  "hard-prompts",
] as const;

function cellTexts(trInner: string): string[] {
  // Keep empty cells for column alignment: a missing price/vote cell must
  // not shift subsequent columns left. rowCells preserves empties in order.
  const cells = rowCells(trInner).map((cell) => decodeEntities(cell).trim());
  // Drop the trailing artifact from splitting (content after the last </td>).
  // rowCells never produces it, but keep the guard for direct callers.
  return cells;
}

function titleOf(trInner: string): string | null {
  const m = /<span[^>]*\btitle\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i.exec(trInner);
  if (!m) return null;
  const value = (m[1] ?? m[2] ?? m[3] ?? "").trim();
  return value || null;
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
 * Parse one leaderboard `<tr>`; null for non-data rows.
 * Cell order: rank | spread | model | score | votes | price | context.
 */
function parseRank(v: string | undefined): number | null {
  if (v == null) return null;
  const trimmed = v.replace(/,/g, "").trim();
  // Empty strings must not coerce via Number("") === 0.
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

export function parseArenaRow(trInner: string): ArenaRankEntry | null {
  const cells = cellTexts(trInner);
  const rank = parseRank(cells[0]);
  const modelCell = cells.length >= 7 ? (cells[2] ?? "") : (cells[1] ?? "");
  // Prefer the title attr; else the most slug-like token.
  const tokens = modelCell.split(/\s+/).filter(Boolean);
  const slugLike = tokens.find((tok) => tok.includes("-") || tok.includes("/"));
  const id = titleOf(trInner) ?? slugLike ?? tokens[tokens.length - 1] ?? "";
  // Unified dirty/invalid/unsuitable gate (cell count + rank + id).
  if (!isValidArenaRow(cells, rank, id)) return null;
  const validRank = rank as number;
  const name = modelCell || id;
  const scoreCell = cells.length >= 7 ? (cells[3] ?? "") : (cells[2] ?? "");
  const votesCell = cells.length >= 7 ? (cells[4] ?? "") : (cells[3] ?? "");
  const priceCell = cells.length >= 7 ? (cells[5] ?? "") : "";
  const contextCell = cells.length >= 7 ? (cells[6] ?? "") : "";
  const [priceInput, priceOutput] = parseMoneyPair(priceCell);
  const preliminary = /preliminary/i.test(trInner);
  return {
    rank: validRank,
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

/** Parse the full leaderboard page; pure. */
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

/** Arena human-preference leaderboard. Failures degrade to short TTL. */
export const getArenaRankings = (ctx: AppContext): Promise<ArenaRankingsPayload> =>
  ctx.cache.withTtl(cacheKeys.arenaRankings, SLOW_TTL_MS, async () => {
    const entries = await fetchArenaBoard(ctx, "overall");
    return { data: { entries, fetchedAt: new Date().toISOString() } };
  });

/** One Arena capability slice for the benchmark tab. */
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
