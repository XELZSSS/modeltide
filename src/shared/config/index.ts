import type { NewsCategory, SearchResultSource, SourceStatus } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

// API paths, KV keys, cache headers, TTLs. Client builders live in
// src/client/api/queries.ts under the same `apiPaths` name (different shape).
export const API_DOMAINS = {
  artificialIndex: "artificial-analysis-index",
  openSourceModels: "open-source-models",
  openSourceReleases: "open-source-releases",
  news: "news",
  openRouterRankings: "openrouter-rankings",
  // Internal-only KV key (no public route): the OR model directory backing
  // pricing + AA backfill. Kept here so cache clears stay in one place.
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

// Bump when a cached payload shape changes; list touched payloads in the commit.
export const CACHE_VERSION = "v2";

/** Largest page the open-source endpoints will serve (also the top normalize bucket). */
export const MAX_MODEL_LIMIT = 500;

/** Browser → CDN (stale-if-error 1d) → KV (stale fallback in server/infra.ts). */
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
 * Soft TTLs by volatility: live 30m (leaderboards, news, home), slow 2h
 * (arena, HF, OR directory), static 6h (provider docs, changelog), partial 5m
 * (degraded payloads retry soon without burning KV writes). Hard expiry is
 * ttl + 1 day. Keep tiers a multiple of the 30m cron cadence.
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

// Warm window derived from NEWS_TTL_MS so retuning the TTL keeps it aligned.
const NEWS_WARM_SPAN_MINUTES = 4;

export function newsWarmDue(utcMinutes: number = new Date().getUTCMinutes()): boolean {
  const intervalMinutes = Math.max(NEWS_TTL_MS / ONE_MINUTE - 2, NEWS_WARM_SPAN_MINUTES + 1);
  return utcMinutes % intervalMinutes < NEWS_WARM_SPAN_MINUTES;
}

// Upstream origins + RSS feeds. Endpoints stay static (no staging tier);
// USER_AGENT, WARM_ORIGIN, REPO_URL use the deployed name — keep in sync on rename.
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
  moonshot: "https://platform.kimi.ai",
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

// Per-attempt timeout: 1 retry is ~21s worst case, inside the 25s route timeout.
export const UPSTREAM_TIMEOUT_MS = 10_000;
export const PROBE_TIMEOUT_MS = 8_000;

export const USER_AGENT = "ModelTide/2.0 (+https://github.com/XELZSSS/modeltide)";
export const WARM_ORIGIN = "https://modeltide.internal";

// Feeds below were verified reachable with plain fetch + UA.
const AI_NEWS = "https://www.artificialintelligence-news.com/feed/";
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

/** A category is healthy while any one feed responds; failures shorten the TTL. */
export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [AI_NEWS, TECHCRUNCH_AI, SILICONANGLE_AI, ARS_TECHNICA, MIT_TECH_REVIEW, WIRED_AI],
  opensource: [ANALYTICS_VIDHYA, HF_BLOG, IMPORT_AI, LAST_WEEK_IN_AI, PHORONIX],
  hardware: [TOMS_HARDWARE, TECHPOWERUP, SERVE_THE_HOME, TECHCRUNCH_HARDWARE, TECHCRUNCH_GADGETS],
  funding: [TECHCRUNCH_STARTUPS, CRUNCHBASE_NEWS, BLOCKS_AND_FILES],
};

export const NEWS_CATEGORIES = Object.keys(rssConfig) as NewsCategory[];

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

// Persisted in localStorage — never rename values.
export const STORAGE_KEYS = {
  settings: "settings",
  compare: "compare-store",
} as const;

export type ModelSource = "aa" | "or" | "os" | "hall";

/** Search-result tab → model-detail source id. */
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
};

/** Allowlist: each entry maps to a verified /leaderboard/text/<slug> page. */
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
export const SOURCE_IDS = ["artificialAnalysis", "huggingface", "openrouter", "news", "arena"] as const;
