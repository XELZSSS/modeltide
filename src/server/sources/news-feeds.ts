import type { NewsCategory } from "@/shared/types/news";

const TECHCRUNCH_AI = "https://techcrunch.com/category/artificial-intelligence/feed/";
const ARS_TECHNICA_AI = "https://arstechnica.com/ai/feed/";
const MIT_TECH_REVIEW = "https://www.technologyreview.com/topic/artificial-intelligence/feed/";
const HF_BLOG = "https://huggingface.co/blog/feed.xml";
const PYTORCH_BLOG = "https://pytorch.org/feed/";
const TOMS_HARDWARE = "https://www.tomshardware.com/feeds.xml";
const CRUNCHBASE_NEWS = "https://news.crunchbase.com/feed/";
const ARXIV_NLP_AI =
  "https://export.arxiv.org/api/query?search_query=cat:cs.CL+OR+cat:cs.AI&sortBy=submittedDate&sortOrder=descending&max_results=40";
const ARXIV_ML =
  "https://export.arxiv.org/api/query?search_query=cat:cs.LG&sortBy=submittedDate&sortOrder=descending&max_results=40";
const IMPORT_AI = "https://jack-clark.net/feed/";

export const rssConfig: Record<NewsCategory, readonly string[]> = {
  industry: [TECHCRUNCH_AI, ARS_TECHNICA_AI, MIT_TECH_REVIEW],
  opensource: [HF_BLOG, PYTORCH_BLOG],
  hardware: [TOMS_HARDWARE],
  funding: [CRUNCHBASE_NEWS],
  research: [ARXIV_NLP_AI, ARXIV_ML, IMPORT_AI],
};
