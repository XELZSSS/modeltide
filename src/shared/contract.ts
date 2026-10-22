import type { ApiDomain } from "./config/api";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HomeDashboardData,
  NewsCategory,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  SourcePayload,
} from "./types";
export type { ApiDomain };

export type NewsByCategory = Record<NewsCategory, SourcePayload<NewsItem[]>>;

interface ApiContract {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsByCategory;
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openRouterRankings: OpenRouterRankEntry[];
}

export type PayloadOf<D extends ApiDomain> = ApiContract[D] & unknown;

export type DomainPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
