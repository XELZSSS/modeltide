import type { NewsCategory } from "@/shared/types/news";

/*
 * Three feeds per category, so one unreachable host cannot empty a category. A feed is chosen for what it adds as a news
 * source — articles, not release notes — at a size and latency one cold invocation can afford.
 */
const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const GOOGLE_AI_BLOG = "https://blog.google/technology/ai/rss/";
const SIMON_WILLISON = "https://simonwillison.net/atom/everything/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const INFOQ_AI = "https://feed.infoq.com/ai-ml-data-eng/";
const NEXT_PLATFORM = "https://www.nextplatform.com/feed/";
const SERVE_THE_HOME = "https://www.servethehome.com/feed/";
const NVIDIA_BLOG = "https://blogs.nvidia.com/feed/";
const GOOGLE_RESEARCH = "https://research.google/blog/rss/";
const DEEPMIND_BLOG = "https://deepmind.google/blog/rss.xml";
const APPLE_ML_RESEARCH = "https://machinelearning.apple.com/rss.xml";

interface NewsFeed {
  id: string;
  url: string;
  /** The name its items are attributed to, declared rather than read from the channel title: see `channelTitle` in `formats/feed-fields.ts`. */
  sourceName: string;
}

export const rssFeeds: Record<NewsCategory, readonly NewsFeed[]> = {
  industry: [
    { id: "newsTechCrunch", url: TECHCRUNCH_AI, sourceName: "TechCrunch" },
    { id: "newsArsTechnica", url: ARS_TECHNICA_AI, sourceName: "Ars Technica" },
    { id: "newsGoogleAi", url: GOOGLE_AI_BLOG, sourceName: "Google AI" },
  ],
  opensource: [
    { id: "newsSimonWillison", url: SIMON_WILLISON, sourceName: "Simon Willison" },
    { id: "newsHfBlog", url: HF_BLOG, sourceName: "Hugging Face" },
    { id: "newsInfoQ", url: INFOQ_AI, sourceName: "InfoQ" },
  ],
  hardware: [
    { id: "newsNextPlatform", url: NEXT_PLATFORM, sourceName: "The Next Platform" },
    { id: "newsServeTheHome", url: SERVE_THE_HOME, sourceName: "ServeTheHome" },
    { id: "newsNvidia", url: NVIDIA_BLOG, sourceName: "NVIDIA" },
  ],
  research: [
    { id: "newsGoogleResearch", url: GOOGLE_RESEARCH, sourceName: "Google Research" },
    { id: "newsDeepMind", url: DEEPMIND_BLOG, sourceName: "Google DeepMind" },
    { id: "newsAppleMl", url: APPLE_ML_RESEARCH, sourceName: "Apple ML Research" },
  ],
};

/**
 * Feeds fetched in one leg round per category: the widest category, so no category can ever need a second round. The round
 * count is a timeout budget: one round has to land inside `INFLIGHT_HANG_GUARD_MS`, which itself stays inside the
 * `waitUntil` cap, and a second round would not. Derived rather than declared: a fourth feed widens the round instead of
 * outgrowing a fixed count.
 */
export const NEWS_LEG_CONCURRENCY = Math.max(...Object.values(rssFeeds).map((feeds) => feeds.length));
