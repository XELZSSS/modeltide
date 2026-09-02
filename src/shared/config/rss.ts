import type { NewsCategory } from "@/shared/types";

// Every feed below is verified reachable with the worker's plain fetch + UA and
// serves topic-matched items for its category (sampled titles, not just status codes).

// -- Industry: mainstream AI business/industry news --------------------------------
const VENTUREBEAT_AI = "https://venturebeat.com/category/ai/feed/";
const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const SILICONANGLE_AI = "https://siliconangle.com/category/ai/feed/";
const ARS_TECHNICA = "https://feeds.arstechnica.com/arstechnica/index";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const WIRED_AI = "https://www.wired.com/feed/tag/ai/latest/rss";

// -- Open source & community -------------------------------------------------------
const ANALYTICS_VIDHYA = "https://www.analyticsvidhya.com/blog/category/artificial-intelligence/feed/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const IMPORT_AI = "https://www.importai.net/feed";
const LAST_WEEK_IN_AI = "https://lastweekinai.substack.com/feed";
const PHORONIX = "https://www.phoronix.com/rss.php";

// -- Compute & hardware ------------------------------------------------------------
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds/all";
const TECHPOWERUP = "https://www.techpowerup.com/rss/news";
const SERVE_THE_HOME = "https://www.servethehome.com/feed/";
const TECHCRUNCH_HARDWARE = "https://techcrunch.com/category/hardware/feed/";
const TECHCRUNCH_GADGETS = "https://techcrunch.com/category/gadgets/feed/";

// -- VC & funding ------------------------------------------------------------------
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
