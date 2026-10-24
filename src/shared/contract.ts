import type { ApiDomain } from "./config/api";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HomeDashboardData,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  SourcePayload,
} from "./types";
export type { ApiDomain };

interface ApiContract {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsItem[];
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openRouterRankings: OpenRouterRankEntry[];
}

export type PayloadOf<D extends ApiDomain> = ApiContract[D];

export type DomainPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
