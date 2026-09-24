import { memo, useMemo, type ComponentType } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import {
  useHallucinationRankings,
  useSuspenseArtificialRankingsState,
  useSuspenseOpenSourceModelsState,
  useSuspenseOpenRouterRankings,
} from "@/client/api/api-queries";
import { assertPayloadShape } from "@/client/api/payload-normalize";
import { EmptyState, PartialNotice } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { SearchInput } from "@/client/search/search-input";
import { type TabItem } from "@/client/components/ui/tabs";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { col, monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { LabeledDot } from "@/client/components/ui/primitives";
import { SearchableDataTable } from "@/client/components/data/table";
import { isHallucinationDataUnavailable } from "@/client/utils/hallucination";
import { formatScore, formatPricePerMillion, formatSpeed } from "@/client/utils/format";
import { computeProviderStats, type ProviderStats } from "@/client/utils/model-utils";
import { DEFAULT_RANKING_TAB, MODEL_SOURCES, RANKING_TABS, type RankingTabId } from "@/client/config/nav-config";
import { loadableView } from "@/client/router/lazy-view";

const ArtificialAnalysisView = loadableView(() =>
  import("./aa-view").then((m) => ({ default: m.ArtificialAnalysisView })),
);
const OpenRouterRankingsView = loadableView(() =>
  import("./openrouter-rankings-view").then((m) => ({ default: m.OpenRouterRankingsView })),
);
const RankingViewsModule = {
  OpenSource: loadableView(() => import("./open-source-view").then((m) => ({ default: m.OpenSourceRankingsView }))),
  Hallucination: loadableView(() =>
    import("./hallucination-view").then((m) => ({ default: m.HallucinationRankingsView })),
  ),
  Agent: loadableView(() => import("./agent-view").then((m) => ({ default: m.AgentRankingsView }))),
};

const TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: MODEL_SOURCES.aa.sourceLabelKey,
  openRouterRankings: MODEL_SOURCES.or.sourceLabelKey,
  openSourceRankings: MODEL_SOURCES.os.sourceLabelKey,
  hallucinationRankings: MODEL_SOURCES.hall.sourceLabelKey,
  agentRankings: "agentSource",
  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

const ModelRankingsTab = memo(function ModelRankingsTab() {
  const { items, partial, malformed } = useSuspenseArtificialRankingsState();
  assertPayloadShape(malformed, "artificialIndex");
  return (
    <>
      {partial && <PartialNotice />}
      <ArtificialAnalysisView rankings={items} />
    </>
  );
});
const OpenSourceTab = memo(function OpenSourceTab() {
  const { items, partial, malformed } = useSuspenseOpenSourceModelsState();
  assertPayloadShape(malformed, "openSourceModels");
  return (
    <>
      {partial && <PartialNotice />}
      <RankingViewsModule.OpenSource rankings={items} />
    </>
  );
});

const HallucinationRankingsTab = memo(function HallucinationRankingsTab() {
  const { items, partial, malformed } = useSuspenseArtificialRankingsState();
  const rankings = useHallucinationRankings(items);
  const { t } = useTranslation();
  assertPayloadShape(malformed, "artificialIndex");
  const unavailable = isHallucinationDataUnavailable(items, rankings);
  return (
    <>
      {partial && <PartialNotice />}
      {unavailable ? (
        <EmptyState variant="error" message={t("rankingsUnavailable")} />
      ) : (
        <RankingViewsModule.Hallucination rankings={rankings} />
      )}
    </>
  );
});

const OpenRouterTab = memo(function OpenRouterTab() {
  const { data } = useSuspenseOpenRouterRankings();
  return <OpenRouterRankingsView data={data} />;
});

const AgentRankingsTab = RankingViewsModule.Agent;

const getProviderRowId = (p: ProviderStats) => p.name;
const getProviderSearchFields = (p: ProviderStats) => [p.name];

const ProviderCompareTab = memo(function ProviderCompareTab() {
  const { items, partial, malformed } = useSuspenseArtificialRankingsState();
  assertPayloadShape(malformed, "artificialIndex");
  const { t } = useTranslation();
  const providerStats = useMemo(() => computeProviderStats(items, t("unknown")), [items, t]);
  const columns = useMemo<DataTableColumn<ProviderStats>[]>(
    () => [
      col("name", t("provider"), (p) => <LabeledDot color={p.color}>{p.name}</LabeledDot>),
      monoCol("count", t("modelCount"), (p) => p.count),
      monoCol("avgIntelligence", t("avgIntelligence"), (p) => formatScore(p.avgIntelligence, t), {
        mobilePrimary: true,
      }),
      monoCol("avgPrice", t("avgPrice"), (p) => formatPricePerMillion(p.avgPrice, t), { hiddenMd: true }),
      rightCol(
        "avgSpeed",
        t("avgSpeed"),
        (p) => (
          <span className="text-sm text-text-primary">
            {p.avgSpeed != null ? `${formatSpeed(p.avgSpeed, t)} ${t("tokensPerSecond")}` : t("notAvailable")}
          </span>
        ),
        { hiddenMd: true },
      ),
    ],
    [t],
  );
  return (
    <>
      {partial && <PartialNotice />}
      <SearchableDataTable
        columns={columns}
        data={providerStats}
        getRowId={getProviderRowId}
        getSearchFields={getProviderSearchFields}
      />
    </>
  );
});

const TAB_COMPONENTS: Record<RankingTabId, ComponentType> = {
  modelRankings: ModelRankingsTab,
  openRouterRankings: OpenRouterTab,
  openSourceRankings: OpenSourceTab,
  hallucinationRankings: HallucinationRankingsTab,
  agentRankings: AgentRankingsTab,
  providerCompare: ProviderCompareTab,
};

export function RankingsHubView() {
  const { t } = useTranslation();
  const [activeTabId, handleTabChange] = useClientTab("tab", RANKING_TABS, DEFAULT_RANKING_TAB);
  const tabs: TabItem[] = useMemo(() => RANKING_TABS.map((id) => ({ id, label: t(id) })), [t]);
  const ActiveContent = TAB_COMPONENTS[activeTabId];

  return (
    <TabbedPage
      compact
      title={t(activeTabId)}
      description={t(TAB_SOURCE_LABEL[activeTabId])}
      actions={<SearchInput />}
      tabs={tabs}
      activeTab={activeTabId}
      tabSize="md"
      tabFill
      onTabChange={handleTabChange}
    >
      <SuspenseQuery>
        <ActiveContent />
      </SuspenseQuery>
    </TabbedPage>
  );
}
