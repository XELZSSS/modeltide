import type { NewsCategory } from "@/shared/types/news";

/*
 * Three feeds per category, so one unreachable host cannot empty a category while the shelf still fills from the others.
 * A feed is chosen for what it adds as a news source — articles, not release notes or changelogs — at a size and latency
 * one cold invocation can afford: a body under ~300 KB (the item cap and the opaque article bodies keep the parse
 * bounded), a warm request under ~2 s, and a channel title the row can print as the source. Each was probed three times
 * before being listed; the counts below are what that probe measured.
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
  /**
   * The name its items are attributed to. Declared rather than read from the feed's channel title: see `channelTitle`
   * in `formats/feed-fields.ts` for why four of these twelve feeds ship a title that is a section name, a sentence or
   * the bare word `AI`, and why a heuristic cannot repair them without breaking the names that are already right.
   */
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
 * Feeds fetched in one leg round per category: the widest category, so no category can ever need a second round.
 *
 * The round count is a timeout budget, not only latency: one round costs at most FEED_TIMEOUT_MS × (retries + 1) +
 * backoff = 22 s, inside the 28 s INFLIGHT_HANG_GUARD_MS, which itself leaves 2 s under the 30 s `waitUntil` cap. A
 * second round would reach 44 s, so the guard would drop the refresh after the upstream work was already paid for.
 *
 * Derived rather than declared: a fixed count beside the feed list is a count the list can outgrow, which is what the
 * build-time rule in `build/guards/structure.ts` used to catch. A fourth feed now widens the round instead.
 */
export const NEWS_LEG_CONCURRENCY = Math.max(...Object.values(rssFeeds).map((feeds) => feeds.length));
