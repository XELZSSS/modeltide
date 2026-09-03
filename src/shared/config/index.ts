import type { NewsCategory, SearchResultSource, SourceStatus } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

// ---- shared/config/api-cache.ts ----
// API + cache + TTL layer: paths, KV keys, browser/CDN headers, expiry helpers.
// Former api.ts + cache.ts + ttl.ts combined.
// NOTE: the client re-exports its own query-string builders under the same
// `apiPaths` name (see src/client/api/client.ts) with a different shape
// (news is a function there). Import the shared map as `baseApiPaths` on the
// client to avoid mixing the two. API_DOMAINS doubles as the KV key namespace;
// "openRouterPricing" is cache-only (no route serves it).
export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceReleases: "open-source-releases",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  openRouterPricing: "openrouter-pricing-map",
  closedReleases: "closed-releases",
  arenaBoard: "arena-board",
  arenaRankings: "arena-rankings",
  officialPricing: "official-pricing",
  statusHistory: "status-history",
  homeDashboard: "home-dashboard",
} as const;

export const apiPaths = {
  artificialIndex: `/api/${API_DOMAINS.artificialIndex}`,
  openSourceModels: `/api/${API_DOMAINS.openSourceModels}`,
  openSourceReleases: `/api/${API_DOMAINS.openSourceReleases}`,
  news: `/api/${API_DOMAINS.news}`,
  openRouterRankings: `/api/${API_DOMAINS.openRouterRankings}`,
  closedReleases: `/api/${API_DOMAINS.closedReleases}`,
  arenaBoard: `/api/${API_DOMAINS.arenaBoard}`,
  arenaRankings: `/api/${API_DOMAINS.arenaRankings}`,
  officialPricing: `/api/${API_DOMAINS.officialPricing}`,
  statusHistory: `/api/${API_DOMAINS.statusHistory}`,
  homeDashboard: `/api/${API_DOMAINS.homeDashboard}`,
} as const;

export const OPEN_SOURCE_MODELS_DEFAULTS = {
  sort: "trendingScore",
  direction: "-1",
  limit: 500,
} as const;

// Bump manually when a cached payload shape changes; old envelopes live until
// their hard expiry (ttl + STALE_WINDOW), so list touched payloads in the bump
// commit (StatusHistoryPayload, OpenRouterRankingsPayload, ...).
export const CACHE_VERSION = "v2";

/** Largest page the open-source endpoints will serve (also the top normalize bucket). */
export const MAX_MODEL_LIMIT = 500;

/**
 * Cache layering: browser (BROWSER_*) → CDN (CDN_*, stale-if-error=1 day) → KV
 * (DEFAULT_TTL_MS in ttl.ts, stale payload fallback in infra/cache.ts).
 */
export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

/** Snap arbitrary limits to a small set so the cache key space stays bounded. */
export function normalizeModelLimit(limit: number): number {
  if (!Number.isFinite(limit) || limit <= 50) return 50;
  if (limit <= 100) return 100;
  return MAX_MODEL_LIMIT;
}

/** Trim a fetched bucket back to the requested limit (?limit=101 fetches 500, serves 101). */
export function sliceToLimit<T>(rows: T[], limit: number): T[] {
  return rows.slice(0, Math.max(0, Math.min(limit, MAX_MODEL_LIMIT)));
}

export const cacheKeys = {
  intelligenceIndex: API_DOMAINS.artificialIndex,
  openSourceModels: (sort: string, direction: string, limit: number) =>
    `${API_DOMAINS.openSourceModels}:${sort}:${direction}:${normalizeModelLimit(limit)}`,
  openSourceReleases: API_DOMAINS.openSourceReleases,
  news: (category: NewsCategory) => `${API_DOMAINS.news}:${category}`,
  openRouterRankings: API_DOMAINS.openRouterRankings,
  openRouterPricing: API_DOMAINS.openRouterPricing,
  closedReleases: API_DOMAINS.closedReleases,
  arenaBoard: (category: string) => `${API_DOMAINS.arenaBoard}:${category}`,
  arenaRankings: API_DOMAINS.arenaRankings,
  officialPricing: API_DOMAINS.officialPricing,
  textToImage: "aa-text-to-image",
  homeDashboard: API_DOMAINS.homeDashboard,
} as const;

export const ONE_MINUTE = 60_000;
export const ONE_HOUR = 60 * ONE_MINUTE;
export const ONE_DAY = 24 * ONE_HOUR;
export const FIVE_MINUTES = 5 * ONE_MINUTE;
export const THIRTY_MINUTES = 30 * ONE_MINUTE;

/**
 * Cache TTL tiers by content volatility (soft TTL inside the KV envelope; hard
 * expiry is ttl + 1 day stale window, see server/infra.ts).
 *
 * - live (30m): leaderboards users watch — AA/OR/token-usage, text-to-image, home.
 * - news (30m): RSS cadence; the cron warm window derives from this value.
 * - slow (2h): slow-drift data — arena votes, HF downloads/likes, OR pricing directory.
 * - static (6h): near-static docs — provider pricing pages, AA changelog.
 * - partial-fail (5m): degraded payloads. Was 1m: a flapping source re-fetched
 *   upstream AND re-put KV on every request past the minute, which is exactly
 *   how KV write caps get blown during an outage. 5m still retries soon.
 *
 * KV write budget (cron every 30 min, KV enabled): a tick refreshes only soft-expired
 * keys, so steady state is ~7 live puts + sampling per tick (~350 writes/day),
 * slow tiers add ~8 puts every 4th tick, static tiers ~2 every 12th tick —
 * comfortably inside the 1,000 writes/day free cap. Keeping every tier a
 * multiple of the cron cadence (plus the ±10% key jitter in infra.ts) stops
 * all keys expiring in the same tick and overrunning the scheduled invocation.
 */
export const DEFAULT_TTL_MS = THIRTY_MINUTES;
export const NEWS_TTL_MS = THIRTY_MINUTES;
export const SLOW_TTL_MS = 2 * ONE_HOUR;
export const STATIC_TTL_MS = 6 * ONE_HOUR;
export const PARTIAL_FAIL_TTL_MS = FIVE_MINUTES;

export function ttlFor(partial: boolean, normalTtl: number = DEFAULT_TTL_MS): number {
  return partial ? PARTIAL_FAIL_TTL_MS : normalTtl;
}
/** Shorthand for multi-feed sources: any feed failure shortens the TTL. */
export function ttlForCount(failCount: number, normalTtl: number = DEFAULT_TTL_MS): number {
  return ttlFor(failCount > 0, normalTtl);
}

// News warm window derived from the TTL: refresh inside the last WARM_SPAN minutes
// before expiry. A fixed 28/4 split drifted when the cron tick slipped; deriving it
// from NEWS_TTL_MS keeps the window aligned if the TTL is ever retuned.
const NEWS_WARM_SPAN_MINUTES = 4;

export function newsWarmDue(utcMinutes: number = new Date().getUTCMinutes()): boolean {
  const intervalMinutes = Math.max(NEWS_TTL_MS / ONE_MINUTE - 2, NEWS_WARM_SPAN_MINUTES + 1);
  return utcMinutes % intervalMinutes < NEWS_WARM_SPAN_MINUTES;
}

// ---- shared/config/sources.ts ----
// Upstream origins + RSS feeds: where all server data comes from.
// Former upstream.ts + rss.ts combined.
// Upstream endpoints are intentionally static (no per-env switching): the Worker
// has no staging tier, and dev uses the same public sources. If a staging mirror
// is ever needed, inject overrides via Wrangler vars (keep_vars is false, so this
// file stays the source of truth) rather than branching on NODE_ENV here.
// NOTE: repo lives at .../aiinsights locally but deploys as "modeltide" (USER_AGENT,
// WARM_ORIGIN, REPO_URL all use the deployed name) — keep them in sync on rename.
export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  openrouter: "https://openrouter.ai",
  /** Arena human-preference leaderboard (Next.js page, server-rendered table rows). */
  arena: "https://arena.ai",
  /** First-party pricing doc origins (one page per provider, no mirror). */
  openai: "https://developers.openai.com",
  anthropic: "https://platform.claude.com",
  googleCloud: "https://cloud.google.com",
  deepseekDocs: "https://api-docs.deepseek.com",
  mistral: "https://mistral.ai",
  moonshot: "https://platform.moonshot.ai",
} as const satisfies Record<
  | "artificialAnalysis"
  | "huggingface"
  | "openrouter"
  | "arena"
  | "openai"
  | "anthropic"
  | "googleCloud"
  | "deepseekDocs"
  | "mistral"
  | "moonshot",
  string
>;

/**
 * Default upstream fetch timeout. Budget math: with 1 retry a hanging fetch costs
 * ~10s + ~0.75s backoff + ~10s ≈ 21s worst case, which fits inside the 25s route
 * timeout (see ROUTE_TIMEOUT_MS in server/api.ts) with room left for parsing.
 * A larger per-attempt timeout would turn upstream hangs into 504s instead of
 * fast 502s served from stale cache — that is exactly the failure seen in the logs.
 */
export const UPSTREAM_TIMEOUT_MS = 10_000;
/** Probe (source health check) timeout */
export const PROBE_TIMEOUT_MS = 8_000;

export const USER_AGENT = "ModelTide/2.0 (+https://github.com/XELZSSS/modeltide)";
export const WARM_ORIGIN = "https://modeltide.internal";

// Every feed below is verified reachable with the worker's plain fetch + UA and
// serves topic-matched items for its category (sampled titles, not just status codes).
const VENTUREBEAT_AI = "https://venturebeat.com/category/ai/feed/";
const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const SILICONANGLE_AI = "https://siliconangle.com/category/ai/feed/";
const ARS_TECHNICA = "https://feeds.arstechnica.com/arstechnica/index";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const WIRED_AI = "https://www.wired.com/feed/tag/ai/latest/rss";
const ANALYTICS_VIDHYA = "https://www.analyticsvidhya.com/blog/category/artificial-intelligence/feed/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const IMPORT_AI = "https://www.importai.net/feed";
const LAST_WEEK_IN_AI = "https://lastweekinai.substack.com/feed";
const PHORONIX = "https://www.phoronix.com/rss.php";
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds/all";
const TECHPOWERUP = "https://www.techpowerup.com/rss/news";
const SERVE_THE_HOME = "https://www.servethehome.com/feed/";
const TECHCRUNCH_HARDWARE = "https://techcrunch.com/category/hardware/feed/";
const TECHCRUNCH_GADGETS = "https://techcrunch.com/category/gadgets/feed/";
const TECHCRUNCH_STARTUPS = "https://techcrunch.com/category/startups/feed/";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
const BLOCKS_AND_FILES = "https://blocksandfiles.com/feed/";

/**
 * Category → feed list. A category stays healthy as long as any one of its feeds
 * responds; partial failures only shorten the cache TTL (see sources/news.ts).
 */
export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [VENTUREBEAT_AI, TECHCRUNCH_AI, SILICONANGLE_AI, ARS_TECHNICA, MIT_TECH_REVIEW, WIRED_AI],
  opensource: [ANALYTICS_VIDHYA, HF_BLOG, IMPORT_AI, LAST_WEEK_IN_AI, PHORONIX],
  hardware: [TOMS_HARDWARE, TECHPOWERUP, SERVE_THE_HOME, TECHCRUNCH_HARDWARE, TECHCRUNCH_GADGETS],
  funding: [TECHCRUNCH_STARTUPS, CRUNCHBASE_NEWS, BLOCKS_AND_FILES],
};

export const NEWS_CATEGORIES = Object.keys(rssConfig) as NewsCategory[];

// ---- shared/config/ui-meta.ts ----
// UI metadata: benchmark keys/labels + model sources + storage keys + source labels.
// Former benchmarks.ts + ui.ts combined.

export const BENCHMARK_KEYS = [
  "aime25",
  "gpqa",
  "hle",
  "mmlu_pro",
  "livecodebench",
  "gdpval",
  "scicode",
  "ifbench",
  "lcr",
  "tau2",
  "tau_banking",
  "terminalbench_v2_1",
  "terminalbench_hard",
  "critpt",
  "apex_agents",
  "omniscience",
] as const;

export type BenchmarkKey = (typeof BENCHMARK_KEYS)[number];

export const BENCHMARK_LABELS: Record<BenchmarkKey, TranslationKey> = {
  aime25: "benchmarkAime25",
  gpqa: "benchmarkGpqa",
  hle: "benchmarkHle",
  mmlu_pro: "benchmarkMmluPro",
  livecodebench: "benchmarkLivecodebench",
  gdpval: "benchmarkGdpval",
  scicode: "benchmarkScicode",
  ifbench: "benchmarkIfbench",
  lcr: "benchmarkLcr",
  tau2: "benchmarkTau2",
  tau_banking: "benchmarkTauBanking",
  terminalbench_v2_1: "benchmarkTerminalbenchV2_1",
  terminalbench_hard: "benchmarkTerminalbenchHard",
  critpt: "benchmarkCritpt",
  apex_agents: "benchmarkApexAgents",
  omniscience: "benchmarkOmniscience",
};

// as-const storage keys; add new keys as literals so typos fail at the use site.
// NOTE: values are persisted in users' localStorage — never rename them.
export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
} as const;

export type ModelSource = "aa" | "or" | "os" | "hall";

/**
 * Central map from search-result source tabs to model-detail source ids.
 * Previously hardcoded at each useSearchAllRankings call site with no checking.
 */
export const SEARCH_SOURCE_TO_MODEL_SOURCE: Record<SearchResultSource, ModelSource> = {
  modelRankings: "aa",
  openRouterRankings: "or",
  openSourceRankings: "os",
  hallucinationRankings: "hall",
};

export const MODEL_SOURCES = {
  aa: {
    sourceLabelKey: "artificialSource" as const,
    backTo: "/models?tab=modelRankings" as const,
    backLabelKey: "backToModelRankings" as const,
  },
  or: {
    sourceLabelKey: "openRouterSource" as const,
    backTo: "/models?tab=openRouterRankings" as const,
    backLabelKey: "backToUsageRankings" as const,
  },
  os: {
    sourceLabelKey: "openSourceDataSource" as const,
    backTo: "/models?tab=openSourceRankings" as const,
    backLabelKey: "backToOpenSourceRankings" as const,
  },
  hall: {
    sourceLabelKey: "hallucinationSource" as const,
    backTo: "/models?tab=hallucinationRankings" as const,
    backLabelKey: "backToHallucinationRankings" as const,
  },
} as const satisfies Record<
  ModelSource,
  { sourceLabelKey: TranslationKey; backTo: string; backLabelKey: TranslationKey }
>;

export const SOURCE_LABELS: Record<SourceStatus["id"], TranslationKey> = {
  artificialAnalysis: "sourceNameArtificial",
  huggingface: "sourceNameHuggingFace",
  openrouter: "sourceNameOpenRouter",
  news: "sourceNameNews",
  arena: "sourceNameArena",
  officialPricing: "sourceNameOfficialPricing",
};

/**
 * Arena capability slices backing the benchmark tab.
 * Allowlist only: every entry maps to a verified `/leaderboard/text/<slug>` page.
 */
export const ARENA_BOARD_CATEGORIES = {
  coding: { labelKey: "arenaCatCoding" },
  math: { labelKey: "arenaCatMath" },
  "creative-writing": { labelKey: "arenaCatCreative" },
  "instruction-following": { labelKey: "arenaCatInstruction" },
  "hard-prompts": { labelKey: "arenaCatHard" },
} as const satisfies Record<string, { labelKey: TranslationKey }>;

export type ArenaBoardKey = keyof typeof ARENA_BOARD_CATEGORIES;
export const ARENA_BOARD_IDS = Object.keys(ARENA_BOARD_CATEGORIES) as ArenaBoardKey[];

export const REPO_URL = "https://github.com/XELZSSS/modeltide";
export const SOURCE_IDS = [
  "artificialAnalysis",
  "huggingface",
  "openrouter",
  "news",
  "arena",
  "officialPricing",
] as const;
