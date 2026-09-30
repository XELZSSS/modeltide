import type { NewsCategory } from "@/shared/types/news";
import type { SourceId } from "@/shared/types";

const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds.xml";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
const ARXIV_CL =
  "https://export.arxiv.org/api/query?search_query=cat:cs.CL&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_AI =
  "https://export.arxiv.org/api/query?search_query=cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_ML =
  "https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40";

export interface NewsFeed {
  id: SourceId;
  url: string;
}

export const rssFeeds: Record<NewsCategory, readonly NewsFeed[]> = {
  industry: [
    { id: "newsTechCrunch", url: TECHCRUNCH_AI },
    { id: "newsArsTechnica", url: ARS_TECHNICA_AI },
    { id: "newsMitTechReview", url: MIT_TECH_REVIEW },
  ],
  opensource: [
    { id: "newsHfBlog", url: HF_BLOG },
    { id: "newsPytorch", url: PYTORCH_BLOG },
  ],
  hardware: [{ id: "newsTomsHardware", url: TOMS_HARDWARE }],
  funding: [{ id: "newsCrunchbase", url: CRUNCHBASE_NEWS }],
  research: [
    { id: "newsArxivNlp", url: ARXIV_CL },
    { id: "newsArxivNlp", url: ARXIV_AI },
    { id: "newsArxivMl", url: ARXIV_ML },
  ],
};
