import type { ApiDomain } from "./config/api";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  CodingAgentEntry,
  CursorBenchEntry,
  DecisionIndexEntry,
  HomeDashboardData,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  SourcePayload,
} from "./types";
export type { ApiDomain };

/**
 * The payload shape behind every API domain, keyed by `ApiDomain` itself. This table and `API_DOMAINS` in
 * `./config/api` are the contract's two halves, and `assertDomainCoverage` below turns both directions of drift into a
 * type error, so the only way to add a domain is to state its payload.
 */
interface ApiContract {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsItem[];
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openRouterRankings: OpenRouterRankEntry[];
  decisionIndex: DecisionIndexEntry[];
  codingAgentRankings: CodingAgentEntry[];
  cursorBench: CursorBenchEntry[];
}

/** A domain the contract has no payload for resolves to `never`, which is what makes the coverage check fail in both directions. */
type MissingPayload<D extends ApiDomain> = ApiContract extends Record<D, unknown> ? D : never;
type ContractOnlyDomain = Exclude<keyof ApiContract, ApiDomain>;

// Every `ApiDomain` has a payload row: the `never` branch is unreachable because `MissingPayload<D>` resolves to `D`.
const assertDomainCoverage: [MissingPayload<ApiDomain>] extends [ApiDomain]
  ? [ContractOnlyDomain] extends [never]
    ? true
    : never
  : never = true;
void assertDomainCoverage;

export type PayloadOf<D extends ApiDomain> = ApiContract[D];

export type DomainPayload<D extends ApiDomain> = SourcePayload<PayloadOf<D>>;
