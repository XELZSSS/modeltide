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

/** Keyed by the same names `API_DOMAINS` maps to URL slugs; the only place the path → payload pairing exists.
 * Extending `Record<Domain, unknown>` makes a domain added without a payload a compile error, not `unknown`. */
export interface ApiContract extends Record<Domain, unknown> {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsItem[];
  agentRankings: AgentRankEntry[];
  openSourceReleases: OpenSourceModelEntry[];
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openSourceModel: OpenSourceModelEntry | null;
  openRouterRankings: OpenRouterRankEntry[];
  statusHistory: StatusHistoryPayload;
}

export type ApiDomain = keyof ApiContract;

export type PayloadOf<D extends ApiDomain> = ApiContract[D];

export type DomainPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
