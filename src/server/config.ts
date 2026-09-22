import { normalizeModelLimit } from "@/shared/config/limits";
import { cacheKey } from "@/shared/config/paths";
import { fnv1aHash } from "@/shared/utils";
import type { NewsCategory } from "@/shared/types/news";

export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  huggingfaceSite: "https://huggingface.co",
  openrouter: "https://openrouter.ai",
  arena: "https://arena.ai",
  githubRaw: "https://raw.githubusercontent.com",
} as const satisfies Record<string, string>;

export const PROBE_TIMEOUT_MS = 8_000;
const UPSTREAM_TIMEOUT_MS = 10_000;
const RSS_TIMEOUT_MS = 7_000;
const LITELLM_TIMEOUT_MS = 15_000;

/** Retry backoff ceiling used by http-client; bounds the worst-case call below. */
export const BACKOFF_MAX_MS = 2_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

export const FAST_FETCH_OPTS = { timeoutMs: RSS_TIMEOUT_MS, retries: 1 } as const;

export const LITELLM_FETCH_OPTS = { timeoutMs: LITELLM_TIMEOUT_MS, retries: 1 } as const;

const FETCH_OPTS = [UPSTREAM_FETCH_OPTS, FAST_FETCH_OPTS, LITELLM_FETCH_OPTS] as const;

/** Worst case for one upstream call: every attempt burns its full timeout, plus the retry backoff. */
const WORST_CASE_UPSTREAM_CALL_MS = Math.max(...FETCH_OPTS.map((o) => o.timeoutMs * (o.retries + 1))) + BACKOFF_MAX_MS;

/**
 * Past every upstream timeout, so a stuck refresh fn is the only thing left that
 * can trip it. Covers a handler that awaits two such calls in sequence (the AA
 * index body, then an enrich leg): letting this fire on a live refresh would
 * release the inflight slot and start a second concurrent fetch for the key.
 */
export const INFLIGHT_HANG_GUARD_MS = WORST_CASE_UPSTREAM_CALL_MS * 2;

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const USER_AGENT = "ModelTide/1.0 (+https://github.com/XELZSSS/modeltide)";

export const upstreamEndpoints = {
  aaIndex: "/evaluations/artificial-analysis-intelligence-index",
  aaModels: "/models",
  aaOmniscience: "/evaluations/omniscience",
  aaTextToImage: "/image/models",
  aaChangelog: "/changelog",
  agentBoard: "/leaderboard/agent",
  openRouterRankings: "/api/frontend/v1/rankings/models",
  openRouterDirectory: "/api/v1/models",
  hfDailyPapers: "/api/daily_papers",
  litellmPricing: "/BerriAI/litellm/main/model_prices_and_context_window.json",
} as const;

export const providerStatusEndpoints = {
  openaiApi: "https://status.openai.com/api/v2/summary.json",
  anthropicApi: "https://status.claude.com/api/v2/summary.json",
  googleCloudApi: "https://status.cloud.google.com/incidents.json",
  groqApi: "https://groqstatus.com/api/v2/summary.json",
  cohereApi: "https://status.cohere.com/api/v2/summary.json",
  fireworksApi: "https://status.fireworks.ai/api/v2/summary.json",
  cerebrasApi: "https://status.cerebras.ai/api/v2/summary.json",
  deepseekApi: "https://deepseek.statuspage.io/api/v2/summary.json",
  moonshotApi: "https://status.moonshot.cn/api/v2/summary.json",
} as const;

export const BROWSER_CACHE_HEADER = "public, max-age=60";
export const BROWSER_NO_STORE_HEADER = "no-store, max-age=0";
export const CDN_CACHE_HEADER = "public, max-age=300, stale-while-revalidate=300, stale-if-error=86400";
export const CDN_NO_STORE_HEADER = "no-store";

export const MEMORY_CACHE_MAX_KEYS = 200;
export const MEMORY_CACHE_MAX_BYTES = 32 * 1024 * 1024;
/** Fallback L1 TTL when the effective TTL is missing/invalid. */
export const L1_MAX_TTL_MS = 60_000;
/** Cap for L1 residency regardless of origin TTL (STATIC 6h stays 15min in L1). */
export const L1_TTL_CAP_MS = 15 * 60_000;

export const MAX_KV_RETENTION_TTL_S = 30 * 24 * 60 * 60;

export const HISTORY_KV_RETENTION_TTL_S = 90 * 24 * 60 * 60;

const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const GITHUB_BLOG = "https://github.blog/feed/";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds.xml";
const TECHPOWERUP = "https://www.techpowerup.com/rss/news";
const TECHCRUNCH_STARTUPS = "https://techcrunch.com/category/startups/feed/";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
const ARXIV_NLP_AI =
  "https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_ML =
  "https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40";
const IMPORT_AI = "https://jack-clark.net/feed/";

export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [TECHCRUNCH_AI, ARS_TECHNICA_AI, MIT_TECH_REVIEW],
  opensource: [HF_BLOG, GITHUB_BLOG, PYTORCH_BLOG],
  hardware: [TOMS_HARDWARE, TECHPOWERUP],
  funding: [TECHCRUNCH_STARTUPS, CRUNCHBASE_NEWS],
  research: [ARXIV_NLP_AI, ARXIV_ML, IMPORT_AI],
};

// Cron tuning knobs (sampling, warmup batches, monitor ping).
export const SAMPLE_TIMEOUT_MS = 45_000;
export const WARM_TASK_TIMEOUT_MS = 45_000;
export const WARM_BATCH_TIMEOUT_MS = 120_000;
export const WARM_CONCURRENCY = 6;
export const PING_TIMEOUT_MS = 5_000;
export const PROBE_CONCURRENCY = 6;
export const PROVIDER_CONCURRENCY = 6;
export const NEWS_LEG_CONCURRENCY = 5;

export const cacheKeys = {
  intelligenceIndex: cacheKey("artificialIndex"),
  aaIndexBody: "aa-index-body",
  aaModelsEnrich: "aa-models-enrich",
  aaOmniscienceEnrich: "aa-omniscience-enrich",
  homeDashboard: cacheKey("homeDashboard"),
  openSourceModels: (sort: string, direction: string, limit: number) =>
    cacheKey("openSourceModels", sort, direction, normalizeModelLimit(limit)),
  openSourceModel: (id: string) => {
    // Always hashed: a raw id would share the key space with the hashed form, so
    // a crafted `?id=` could read another model's entry — or overwrite it with
    // the `null` a 404 lookup caches.
    const trimmed = id.trim();
    return cacheKey("openSourceModels", "by-id", `h:${fnv1aHash(trimmed)}`);
  },
  openSourceReleases: cacheKey("openSourceReleases"),
  news: (category: NewsCategory) => cacheKey("news", category),
  openRouterRankings: cacheKey("openRouterRankings"),
  openRouterPricing: "openrouter-pricing-map:per-million",
  closedReleases: cacheKey("closedReleases"),
  agentRankings: cacheKey("agentRankings"),
  officialPricing: cacheKey("officialPricing"),
  statusHistoryPayload: cacheKey("statusHistory", "payload"),
  textToImage: "aa-text-to-image",
  changelog: "aa-changelog",
} as const;
