import type { NewsCategory } from "@/shared/types/news";
import type { SourceId } from "@/shared/types";

const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const THE_VERGE_AI = "https://www.theverge.com/rss/ai-artificial-intelligence/index.xml";
const GOOGLE_AI_BLOG = "https://blog.google/technology/ai/rss/";
const QBITAI = "https://www.qbitai.com/feed";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
const SIMON_WILLISON = "https://simonwillison.net/atom/everything/";
const OLLAMA_BLOG = "https://ollama.com/blog/rss.xml";
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds.xml";
const NVIDIA_BLOG = "https://blogs.nvidia.com/feed/";
const SERVE_THE_HOME = "https://www.servethehome.com/feed/";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
const TECHCRUNCH_VENTURE = "https://techcrunch.com/category/venture/feed/";
const GOOGLE_RESEARCH = "https://research.google/blog/rss/";
const BAIR_BLOG = "https://bair.berkeley.edu/blog/feed.xml";
const MIT_NEWS_AI = "https://news.mit.edu/rss/topic/artificial-intelligence2";

interface NewsFeed {
  id: SourceId;
  url: string;
}

export const rssFeeds: Record<NewsCategory, readonly NewsFeed[]> = {
  industry: [
    { id: "newsTechCrunch", url: TECHCRUNCH_AI },
    { id: "newsArsTechnica", url: ARS_TECHNICA_AI },
    { id: "newsMitTechReview", url: MIT_TECH_REVIEW },
    { id: "newsVerge", url: THE_VERGE_AI },
    { id: "newsGoogleAi", url: GOOGLE_AI_BLOG },
    { id: "newsQbitai", url: QBITAI },
  ],
  opensource: [
    { id: "newsHfBlog", url: HF_BLOG },
    { id: "newsPytorch", url: PYTORCH_BLOG },
    { id: "newsSimonWillison", url: SIMON_WILLISON },
    { id: "newsOllama", url: OLLAMA_BLOG },
  ],
  hardware: [
    { id: "newsTomsHardware", url: TOMS_HARDWARE },
    { id: "newsNvidia", url: NVIDIA_BLOG },
    { id: "newsServeTheHome", url: SERVE_THE_HOME },
  ],
  funding: [
    { id: "newsCrunchbase", url: CRUNCHBASE_NEWS },
    { id: "newsTechCrunchVenture", url: TECHCRUNCH_VENTURE },
  ],
  research: [
    { id: "newsGoogleResearch", url: GOOGLE_RESEARCH },
    { id: "newsBair", url: BAIR_BLOG },
    { id: "newsMitNewsAi", url: MIT_NEWS_AI },
  ],
};
