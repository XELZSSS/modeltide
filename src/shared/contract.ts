import type { ApiDomain } from "./config/api";
import type {
  ArtificialAnalysisModel,
  ClosedReleaseEntry,
  DecisionIndexEntry,
  HomeDashboardData,
  NewsItem,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  SourcePayload,
} from "./types";
export type { ApiDomain };

/**
 * The payload shape behind every API domain, keyed by `ApiDomain` itself.
 *
 * The two tables — this one and `API_DOMAINS` in `./config/api` — are the contract's two halves, and neither compiler
 * nor test compared them: a domain added to `API_DOMAINS` without a row here left `PayloadOf` silently answering `never`,
 * and a row here for a domain that does not exist was simply dead. `assertDomainCoverage` below turns both directions
 * into a type error, so the only way to add a domain is to state its payload.
 */
interface ApiContract {
  artificialIndex: ArtificialAnalysisModel[];
  homeDashboard: HomeDashboardData;
  news: NewsItem[];
  openSourceModels: OpenSourceModelEntry[];
  closedReleases: ClosedReleaseEntry[];
  openRouterRankings: OpenRouterRankEntry[];
  decisionIndex: DecisionIndexEntry[];
}

/**
 * A domain the contract has no payload for resolves to `never`, and `never` is what makes the coverage check fail: the
 * conditional below is only satisfied when the two key sets are identical, so neither table can outgrow the other.
 */
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
