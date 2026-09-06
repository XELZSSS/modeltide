import type { NewsCategory } from "@/shared/types/news";

export const upstreamConfig = {
  artificialAnalysis: "https://artificialanalysis.ai",
  huggingface: "https://huggingface.co/api/models",
  huggingfaceSite: "https://huggingface.co",
  openrouter: "https://openrouter.ai",
  arena: "https://arena.ai",
  githubRaw: "https://raw.githubusercontent.com",
} as const satisfies Record<string, string>;

export const UPSTREAM_TIMEOUT_MS = 10_000;
export const PROBE_TIMEOUT_MS = 8_000;

export const UPSTREAM_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 1 } as const;

export const FAST_FETCH_OPTS = { timeoutMs: UPSTREAM_TIMEOUT_MS, retries: 0 } as const;

export const MAX_JSON_BYTES = 5 * 1024 * 1024;
export const MAX_FEED_BYTES = 2 * 1024 * 1024;

export const USER_AGENT = "ModelTide/1.0 (+https://github.com/XELZSSS/modeltide)";
export const WARM_ORIGIN = "https://modeltide.internal";

export const WARM_HOST = ((): string => {
  try {
    return new URL(WARM_ORIGIN).host;
  } catch {
    return "";
  }
})();

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
const ARXIV_NLP_AI =
  "https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_ML =
  "https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40";

export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [AI_NEWS, TECHCRUNCH_AI, SILICONANGLE_AI, ARS_TECHNICA, MIT_TECH_REVIEW, WIRED_AI],
  opensource: [ANALYTICS_VIDHYA, HF_BLOG, IMPORT_AI, LAST_WEEK_IN_AI, PHORONIX],
  hardware: [TOMS_HARDWARE, TECHPOWERUP, SERVE_THE_HOME, TECHCRUNCH_HARDWARE, TECHCRUNCH_GADGETS],
  funding: [TECHCRUNCH_STARTUPS, CRUNCHBASE_NEWS, BLOCKS_AND_FILES],
  research: [ARXIV_NLP_AI, ARXIV_ML],
};
