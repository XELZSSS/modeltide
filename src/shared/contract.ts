import type { ApiDomain } from "@/shared/config/paths";
import type {
  AgentRankEntry,
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  HomeDashboardData,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  SourceIncidentLog,
  SourcePayload,
  StatusHistoryPayload,
} from "@/shared/types";
export type { ApiDomain };

interface ApiContract extends Record<ApiDomain, unknown> {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsItem[];
  agentRankings: AgentRankEntry[];
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openSourceModel: OpenSourceModelEntry | null;
  openRouterRankings: OpenRouterRankEntry[];
  statusHistory: StatusHistoryPayload;
  sourceIncidents: SourceIncidentLog;
}

export type PayloadOf<D extends ApiDomain> = ApiContract[D];

export type DomainPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
