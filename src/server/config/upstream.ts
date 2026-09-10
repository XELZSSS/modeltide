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

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

export const FAST_FETCH_OPTS = { timeoutMs: RSS_TIMEOUT_MS, retries: 1 } as const;

export const LITELLM_FETCH_OPTS = { timeoutMs: LITELLM_TIMEOUT_MS, retries: 1 } as const;

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const USER_AGENT = "ModelTide/1.0 (+https://github.com/XELZSSS/modeltide)";

/**
 * Single source of truth for every upstream path. Sources must import from
 * here instead of hard-coding paths locally so renames/drifts are fixed in
 * one place and auditable via `grep upstreamEndpoints`.
 */
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

/** Provider status pages (independent hosts, not under `upstreamConfig`). */
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
export const L1_MAX_TTL_MS = 60_000;

/**
 * Hard ceiling for KV key lifetime (30 days). Every KV write is capped at
 * this TTL so the platform itself guarantees cleanup even if the writer dies.
 */
export const MAX_KV_RETENTION_TTL_S = 30 * 24 * 60 * 60;

/**
 * History keys outlive the generic cache ceiling. The store is pruned to a
 * 30-day window on every merge, so the payload is size-bounded; the longer
 * TTL only buys time when the sampling cron stops firing (project paused,
 * cron config lost) before the platform deletes the last copy of history.
 */
export const HISTORY_KV_RETENTION_TTL_S = 90 * 24 * 60 * 60;

// News tabs (标签按钮) → RSS sources, one comment block per tab so each
// source visibly matches the category it lands in. Kept small on purpose:
// a few authoritative mainstream feeds per tab (fewer upstreams = fewer
// failure modes, faster aggregation, less KV churn on partial failures).
// industry 行业: general AI industry news
const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
// opensource 开源: open-source ecosystem & OSS model releases
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const GITHUB_BLOG = "https://github.blog/feed/";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
// hardware 算力与硬件: chips / consumer hardware
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds/all";
const TECHPOWERUP = "https://www.techpowerup.com/rss/news";
// funding 投融资与创投: startups & venture deals
const TECHCRUNCH_STARTUPS = "https://techcrunch.com/category/startups/feed/";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
// research 研究: preprint papers & research commentary (HF Daily Papers is appended in news.ts)
const ARXIV_NLP_AI =
  "https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_ML =
  "https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40";
const IMPORT_AI = "https://www.importai.net/feed";

export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [TECHCRUNCH_AI, ARS_TECHNICA_AI, MIT_TECH_REVIEW],
  opensource: [HF_BLOG, GITHUB_BLOG, PYTORCH_BLOG],
  hardware: [TOMS_HARDWARE, TECHPOWERUP],
  funding: [TECHCRUNCH_STARTUPS, CRUNCHBASE_NEWS],
  research: [ARXIV_NLP_AI, ARXIV_ML, IMPORT_AI],
};
