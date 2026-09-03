import { STATIC_TTL_MS, UPSTREAM_TIMEOUT_MS, cacheKeys, ttlForCount, upstreamConfig } from "@/shared/config";
import type { OfficialPriceModel, OfficialPricingPayload } from "@/shared/types";
import type { AppContext } from "@/server/context";
import { UpstreamError, errMsg } from "@/server/infra";
import { humanizeId, num, numPositive, priceCell, slugifyName, stripParen } from "@/server/parsers/primitives";
import { rowCells, stripHtml, tableRowInners } from "@/server/parsers/feed";
import { dedupeBy } from "@/shared/utils";

const FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

/** Shared OfficialPriceModel constructor: null when neither leg has a rate. */
function officialModel(
  provider: string,
  id: string,
  name: string,
  input: number | null,
  output: number | null,
  cachedInput: number | null = null,
  contextWindow: number | null = null,
): OfficialPriceModel | null {
  if (input == null && output == null) return null;
  return { id, name, provider, input, cachedInput, output, contextWindow };
}

// ---------------------------------------------------------------------------
// OpenAI: developers.openai.com serves raw markdown via the `.md` suffix, so the
// worker parses markdown tables instead of HTML. Only the FIRST table (Standard
// tier, flagship chat models) is taken; Batch/Flex/Fast/audio/image/video/tools
// tables are intentionally skipped (different units and tiers).
// ---------------------------------------------------------------------------

const OPENAI_PATH = "/api/docs/pricing.md";

/** Parse the first markdown table of the OpenAI pricing doc; pure (unit-tested). */
export function parseOpenAiPricing(md: string): OfficialPriceModel[] {
  const firstTableEnd = md.indexOf("### Batch pricing data");
  const head = firstTableEnd === -1 ? md : md.slice(0, firstTableEnd);
  const models: OfficialPriceModel[] = [];
  for (const line of head.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("|")) continue;
    const cells = trimmed
      .split("|")
      .slice(1, -1)
      .map((c) => c.trim());
    // Header + separator rows have no dollar amounts.
    if (cells.length < 5 || !cells.some((c) => c.includes("$"))) continue;
    const rawName = cells[0] ?? "";
    if (!rawName || /^model$/i.test(rawName)) continue;
    const id = stripParen(rawName);
    if (!id) continue;
    const model = officialModel(
      "OpenAI",
      id,
      id,
      priceCell(cells[1] ?? ""),
      priceCell(cells[4] ?? ""),
      priceCell(cells[2] ?? ""),
    );
    if (model) models.push(model);
  }
  return models;
}

// ---------------------------------------------------------------------------
// Anthropic: docs pricing page, "Model pricing" table.
// Columns: Model | Base input | 5m writes | 1h writes | Cache hits | Output.
// Dollar figures are literal (no multiplier math needed).
// ---------------------------------------------------------------------------

const ANTHROPIC_PATH = "/docs/en/about-claude/pricing";

/** Parse the Anthropic model-pricing table; pure (unit-tested). */
export function parseAnthropicPricing(html: string): OfficialPriceModel[] {
  const start = html.indexOf("Model pricing");
  const end = html.indexOf("Cloud platform pricing", start === -1 ? 0 : start);
  const scope = html.slice(start === -1 ? 0 : start, end === -1 ? undefined : end);
  const models: OfficialPriceModel[] = [];
  for (const trInner of tableRowInners(scope)) {
    const cells = rowCells(trInner);
    if (cells.length < 6) continue;
    const rawName = stripParen(cells[0] ?? "");
    if (!rawName || /^model$/i.test(rawName)) continue;
    // Retired models stay listed for reference; they are not purchasable.
    if (/retired/i.test(cells[0] ?? "")) continue;
    const id = slugifyName(rawName);
    if (!id) continue;
    const model = officialModel(
      "Anthropic",
      id,
      rawName,
      priceCell(cells[1] ?? ""),
      priceCell(cells[5] ?? ""),
      priceCell(cells[4] ?? ""),
    );
    if (model) models.push(model);
  }
  return models;
}

// ---------------------------------------------------------------------------
// Google: cloud.google.com Vertex pricing page (ai.google.dev blocks scrapers).
// Sections are `Name Input … Global$a … Text output … Global$b`; the first
// Global pair is the current effective rate (promo when one is running).
// ---------------------------------------------------------------------------

const GOOGLE_PATH = "/vertex-ai/generative-ai/pricing";

const GOOGLE_MODELS = [
  { name: "Gemini 3.1 Pro Preview", id: "gemini-3.1-pro" },
  { name: "Gemini 3.6 Flash", id: "gemini-3.6-flash" },
  { name: "Gemini 3.5 Flash-Lite", id: "gemini-3.5-flash-lite" },
  { name: "Gemini 3.5 Flash", id: "gemini-3.5-flash" },
  { name: "Gemini 2.5 Flash Lite", id: "gemini-2.5-flash-lite" },
  { name: "Gemini 2.5 Flash", id: "gemini-2.5-flash" },
  { name: "Gemini 2.0 Flash Lite", id: "gemini-2.0-flash-lite" },
  { name: "Gemini 2.0 Flash", id: "gemini-2.0-flash" },
] as const;

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Parse one Google model section; pure (unit-tested). */
export function parseGooglePricing(html: string): OfficialPriceModel[] {
  const text = stripHtml(html);
  const models: OfficialPriceModel[] = [];
  for (const m of GOOGLE_MODELS) {
    // Allow hyphen/space variants ("Flash-Lite" vs "Flash Lite") but never let a
    // base name match inside its Lite sibling ("Flash" followed by " Lite").
    const pattern = escapeRegExp(m.name).replace(/Flash[ -]Lite/, "Flash[\\s-]Lite") + "(?![\\w-]| Lite)";
    const at = text.search(new RegExp(pattern));
    if (at === -1) continue;
    const window = text.slice(at, at + 1500);
    const input = /Input[\s\S]{0,300}?Global\$([\d.]+)/.exec(window)?.[1];
    const output = /(?:Text )?output[\s\S]{0,300}?Global\$([\d.]+)/i.exec(window)?.[1];
    const model = officialModel(
      "Google",
      m.id,
      m.name,
      input != null ? num(Number(input)) : null,
      output != null ? num(Number(output)) : null,
    );
    if (model) models.push(model);
  }
  return models.sort((a, b) => a.id.localeCompare(b.id));
}

// ---------------------------------------------------------------------------
// DeepSeek: docs pricing table. Columns per model are
// [flash, pro, vision-exp]; rows give off-peak triples then PEAK triples —
// the PEAK triple is the conservative standard rate.
// ---------------------------------------------------------------------------

const DEEPSEEK_PATH = "/quick_start/pricing";

const DEEPSEEK_NAMES: Record<string, string> = {
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-v4-flash-vision-exp": "DeepSeek V4 Flash Vision",
};

/** Parse the DeepSeek pricing table from stripped page text; pure (unit-tested). */
export function parseDeepSeekPricing(html: string): OfficialPriceModel[] {
  const text = stripHtml(html);
  const pricingAt = text.indexOf("PRICING");
  if (pricingAt === -1) return [];
  const scope = text.slice(pricingAt);
  // Model ids live in the MODEL header row ABOVE the pricing section, so they
  // must be read from the head, not from the price scope.
  const ids = [...new Set([...text.slice(0, pricingAt).matchAll(/deepseek-v4-[a-z-]+/g)].map((m) => m[0]))].slice(0, 8);
  if (ids.length === 0) return [];
  // Sections run back-to-back (HIT then MISS then OUTPUT), so each window must
  // stop at the next label — otherwise dollar figures bleed across sections.
  const tripleAfter = (label: string, endLabel: string | null): number[] | null => {
    const at = scope.indexOf(label);
    if (at === -1) return null;
    const end = endLabel == null ? -1 : scope.indexOf(endLabel, at + label.length);
    const window = end === -1 ? scope.slice(at, at + 500) : scope.slice(at, end);
    const nums = [...window.matchAll(/\$([\d.]+)/g)].map((m) => Number(m[1]));
    // Off-peak row first, PEAK row second — take the peak (conservative) half.
    if (nums.length < 2 || nums.length % 2 !== 0 || nums.some((n) => !Number.isFinite(n))) return null;
    return nums.slice(nums.length / 2);
  };
  const hit = tripleAfter("CACHE HIT", "CACHE MISS");
  const miss = tripleAfter("CACHE MISS", "OUTPUT TOKENS");
  const out = tripleAfter("OUTPUT TOKENS", null);
  if (!hit || !miss || !out) return [];
  // Like the model ids, the CONTEXT LENGTH row sits above the pricing section.
  const ctxMatch = /CONTEXT LENGTH\s*([\d.]+)\s*M/i.exec(text);
  const contextWindow = ctxMatch?.[1] ? Math.round(Number(ctxMatch[1]) * 1_000_000) : null;
  const models: OfficialPriceModel[] = [];
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i]!;
    const model = officialModel(
      "DeepSeek",
      id,
      DEEPSEEK_NAMES[id] ?? humanizeId(id),
      num(miss[i]),
      num(out[i]),
      num(hit[i]),
      numPositive(contextWindow),
    );
    if (model) models.push(model);
  }
  return models;
}

// ---------------------------------------------------------------------------
// Mistral: marketing page, one card per model ending in its API slug.
// Display names are pinned per known slug (versions in names go stale, but the
// numbers — the part that must stay live — always parse from the page).
// ---------------------------------------------------------------------------

const MISTRAL_PATH = "/pricing/api/";

const MISTRAL_MODELS = [
  { slug: "mistral-medium-latest", name: "Mistral Medium 3.5" },
  { slug: "mistral-small-latest", name: "Mistral Small 4" },
  { slug: "mistral-large-latest", name: "Mistral Large 3" },
  { slug: "codestral-latest", name: "Codestral" },
  { slug: "ministral-14b-latest", name: "Ministral 3 14B" },
  { slug: "ministral-8b-latest", name: "Ministral 3 8B" },
  { slug: "ministral-3b-latest", name: "Ministral 3 3B" },
] as const;

/** Parse Mistral model cards from stripped page text; pure (unit-tested). */
export function parseMistralPricing(html: string): OfficialPriceModel[] {
  const text = stripHtml(html);
  const models: OfficialPriceModel[] = [];
  for (const m of MISTRAL_MODELS) {
    const at = text.indexOf(m.slug);
    if (at === -1) continue;
    const window = text.slice(Math.max(0, at - 900), at);
    const matches = [
      ...window.matchAll(
        /Input\s*\(\/M tokens\)\s*\$([\d.]+)\s*(?:Cached input\s*\(\/M tokens\)\s*\$([\d.]+)\s*)?Output\s*\(\/M tokens\)\s*\$([\d.]+)/g,
      ),
    ];
    const last = matches[matches.length - 1];
    if (!last) continue;
    const model = officialModel(
      "Mistral",
      m.slug,
      m.name,
      num(Number(last[1])),
      num(Number(last[3])),
      last[2] != null ? num(Number(last[2])) : null,
    );
    if (model) models.push(model);
  }
  return models;
}

// ---------------------------------------------------------------------------
// Kimi/Moonshot: per-model docs pages with rendered tables:
// [id, unit, cache-hit, cache-miss(input), output, context].
// ---------------------------------------------------------------------------

const KIMI_PAGES = ["/docs/pricing/chat-k3", "/docs/pricing/chat-k26", "/docs/pricing/chat-k27-code"] as const;

const prettifyKimiId = (id: string): string => humanizeId(id.replace(/^kimi-/, ""), "Kimi");

/** Parse one Kimi pricing page; pure (unit-tested). */
export function parseKimiPricing(html: string): OfficialPriceModel[] {
  const models: OfficialPriceModel[] = [];
  for (const trInner of tableRowInners(html)) {
    const cells = rowCells(trInner);
    if (cells.length < 6) continue;
    const id = cells[0] ?? "";
    if (!/^kimi-/i.test(id) || /highspeed/i.test(id)) continue;
    if (!/1M/i.test(cells[1] ?? "")) continue;
    const ctxDigits = (cells[5] ?? "").replace(/[^\d]/g, "");
    const model = officialModel(
      "Kimi",
      id.toLowerCase(),
      prettifyKimiId(id.toLowerCase()),
      priceCell(cells[3] ?? ""),
      priceCell(cells[4] ?? ""),
      priceCell(cells[2] ?? ""),
      ctxDigits ? numPositive(Number(ctxDigits)) : null,
    );
    if (model) models.push(model);
  }
  return models;
}

/**
 * First-party rates scraped straight from provider docs (no third-party mirror).
 * Each provider fans out in parallel; per-provider failures are logged and only
 * shorten the TTL (news.ts partial-failure precedent).
 */
export const getOfficialPricing = (ctx: AppContext): Promise<OfficialPricingPayload> =>
  ctx.cache.withTtl(cacheKeys.officialPricing, STATIC_TTL_MS, async () => {
    const textOpts = {
      headers: { accept: "text/html,application/xhtml+xml,*/*" },
      ...FETCH_OPTS,
    };
    const tasks: [string, Promise<OfficialPriceModel[]>][] = [
      [
        "openai",
        ctx.http
          .text(`${upstreamConfig.openai}${OPENAI_PATH}`, {
            headers: { accept: "text/markdown,text/plain,*/*" },
            ...FETCH_OPTS,
          })
          .then(parseOpenAiPricing),
      ],
      [
        "anthropic",
        ctx.http.text(`${upstreamConfig.anthropic}${ANTHROPIC_PATH}`, textOpts).then(parseAnthropicPricing),
      ],
      ["google", ctx.http.text(`${upstreamConfig.googleCloud}${GOOGLE_PATH}`, textOpts).then(parseGooglePricing)],
      [
        "deepseek",
        ctx.http.text(`${upstreamConfig.deepseekDocs}${DEEPSEEK_PATH}`, textOpts).then(parseDeepSeekPricing),
      ],
      ["mistral", ctx.http.text(`${upstreamConfig.mistral}${MISTRAL_PATH}`, textOpts).then(parseMistralPricing)],
      [
        "kimi",
        Promise.all(KIMI_PAGES.map((p) => ctx.http.text(`${upstreamConfig.moonshot}${p}`, textOpts))).then((pages) =>
          pages.flatMap(parseKimiPricing),
        ),
      ],
    ];
    const settled = await Promise.allSettled(
      tasks.map(async ([label, promise]): Promise<OfficialPriceModel[]> => {
        try {
          return await promise;
        } catch (err) {
          ctx.log("warn", `[official-pricing] ${label} fetch failed: ${errMsg(err)}`);
          throw err;
        }
      }),
    );
    const models = dedupeBy(
      settled.flatMap((r) => (r.status === "fulfilled" ? r.value : [])),
      (m) => m.id,
    );
    const failed = settled.filter((r) => r.status === "rejected").length;
    if (models.length === 0) {
      throw new UpstreamError("Official pricing: all 6 provider fetches failed");
    }
    return {
      data: { models, updatedAt: null, fetchedAt: new Date().toISOString() },
      ttl: ttlForCount(failed, STATIC_TTL_MS),
    };
  });
