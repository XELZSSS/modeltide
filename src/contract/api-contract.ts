import type { API_DOMAINS } from "@/shared/config/paths";
import type {
  AgentRankEntry,
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HomeDashboardData,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  SourcePayload,
  StatusHistoryPayload,
} from "@/shared/types";

type Domain = keyof typeof API_DOMAINS;

interface ApiContract extends Record<Domain, unknown> {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsItem[];
  agentRankings: AgentRankEntry[];
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openSourceModel: OpenSourceModelEntry | null;
  openRouterRankings: OpenRouterRankEntry[];
  statusHistory: StatusHistoryPayload;
}

export type ApiDomain = keyof ApiContract;

export type PayloadOf<D extends ApiDomain> = ApiContract[D];

export type DomainPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
