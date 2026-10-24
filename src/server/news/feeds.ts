import type { NewsCategory } from "@/shared/types/news";

const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const THE_VERGE_AI = "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml";
const GOOGLE_AI_BLOG = "https://blog.google/technology/ai/rss/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
const SIMON_WILLISON = "https://simonwillison.net/atom/everything/";
const OLLAMA_BLOG = "https://ollama.com/blog/rss.xml";
const NVIDIA_BLOG = "https://blogs.nvidia.com/feed/";
const SERVE_THE_HOME = "https://www.servethehome.com/feed/";
const GOOGLE_RESEARCH = "https://research.google/blog/rss/";
const BAIR_BLOG = "https://bair.berkeley.edu/blog/feed.xml";
const MIT_NEWS_AI = "https://news.mit.edu/rss/topic/artificial-intelligence2";

interface NewsFeed {
  id: string;
  url: string;
}
/**
 * Feeds fetched in one leg round per category; the 6-slot connection pool per invocation is the hard ceiling, leaving
 * one slot spare.
 *
 * The round count is a timeout budget, not only latency: one round costs at most FEED_TIMEOUT_MS × (retries + 1) +
 * backoff = 18 s, inside INFLIGHT_HANG_GUARD_MS (28 s). A second round would reach 36 s, so the guard would drop the
 * refresh after the upstream work was already paid for. Raising this number needs the budget in
 * src/server/upstream/timeouts.ts re-checked; `assertNewsRoundBudget` in build/consistency-guard.ts fails the build
 * if a category lists more feeds than fit one round.
 */
export const NEWS_LEG_CONCURRENCY = 5;

export const rssFeeds: Record<NewsCategory, readonly NewsFeed[]> = {
  industry: [
    { id: "newsTechCrunch", url: TECHCRUNCH_AI },
    { id: "newsArsTechnica", url: ARS_TECHNICA_AI },
    { id: "newsMitTechReview", url: MIT_TECH_REVIEW },
    { id: "newsVerge", url: THE_VERGE_AI },
    { id: "newsGoogleAi", url: GOOGLE_AI_BLOG },
  ],
  opensource: [
    { id: "newsHfBlog", url: HF_BLOG },
    { id: "newsPytorch", url: PYTORCH_BLOG },
    { id: "newsSimonWillison", url: SIMON_WILLISON },
    { id: "newsOllama", url: OLLAMA_BLOG },
  ],
  hardware: [
    { id: "newsNvidia", url: NVIDIA_BLOG },
    { id: "newsServeTheHome", url: SERVE_THE_HOME },
  ],
  research: [
    { id: "newsGoogleResearch", url: GOOGLE_RESEARCH },
    { id: "newsBair", url: BAIR_BLOG },
    { id: "newsMitNewsAi", url: MIT_NEWS_AI },
  ],
};
