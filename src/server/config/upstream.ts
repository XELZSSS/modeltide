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
// source visibly matches the category it lands in.
// industry 行业: general AI industry news
const UNITE_AI = "https://www.unite.ai/feed/";
const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const SILICONANGLE_AI = "https://siliconangle.com/category/ai/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const WIRED_AI = "https://www.wired.com/feed/tag/ai/latest/rss";
const LAST_WEEK_IN_AI = "https://lastweekinai.substack.com/feed";
// opensource 开源: open-source ecosystem & OSS model releases
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const GITHUB_BLOG = "https://github.blog/feed/";
const PHORONIX = "https://www.phoronix.com/rss.php";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
// hardware 算力与硬件: chips / servers / storage / consumer hardware
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds/all";
const TECHPOWERUP = "https://www.techpowerup.com/rss/news";
const SERVE_THE_HOME = "https://www.servethehome.com/feed/";
const TECHCRUNCH_HARDWARE = "https://techcrunch.com/category/hardware/feed/";
const TECHCRUNCH_GADGETS = "https://techcrunch.com/category/gadgets/feed/";
const BLOCKS_AND_FILES = "https://blocksandfiles.com/feed/";
// funding 投融资与创投: startups & venture deals
const TECHCRUNCH_STARTUPS = "https://techcrunch.com/category/startups/feed/";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
const SIFTED = "https://sifted.eu/feed/";
// research 研究: preprint papers & research commentary (HF Daily Papers is appended in news.ts)
const ARXIV_NLP_AI =
  "https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_ML =
  "https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40";
const IMPORT_AI = "https://www.importai.net/feed";

export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [UNITE_AI, TECHCRUNCH_AI, SILICONANGLE_AI, ARS_TECHNICA_AI, MIT_TECH_REVIEW, WIRED_AI, LAST_WEEK_IN_AI],
  opensource: [HF_BLOG, GITHUB_BLOG, PHORONIX, PYTORCH_BLOG],
  hardware: [TOMS_HARDWARE, TECHPOWERUP, SERVE_THE_HOME, TECHCRUNCH_HARDWARE, TECHCRUNCH_GADGETS, BLOCKS_AND_FILES],
  funding: [TECHCRUNCH_STARTUPS, CRUNCHBASE_NEWS, SIFTED],
  research: [ARXIV_NLP_AI, ARXIV_ML, IMPORT_AI],
};
