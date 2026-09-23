import { lazy, memo, useMemo, type ComponentType } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import {
  useHallucinationRankings,
  useSuspenseArtificialRankingsState,
  useSuspenseOpenSourceModels,
  useSuspenseOpenRouterRankings,
} from "@/client/api/api-queries";
import { PartialNotice } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { SearchInput } from "@/client/search/search-input";
import { type TabItem } from "@/client/components/ui/tabs";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { col, monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { LabeledDot } from "@/client/components/ui/primitives";
import { SearchableDataTable } from "@/client/components/data/table";
import { formatScore, formatPricePerMillion, formatSpeed } from "@/client/utils/format";
import { computeProviderStats, type ProviderStats } from "@/client/utils/model-utils";
import { DEFAULT_RANKING_TAB, MODEL_SOURCES, RANKING_TABS, type RankingTabId } from "@/client/config/nav-config";

const ArtificialAnalysisView = lazy(() => import("./aa-view").then((m) => ({ default: m.ArtificialAnalysisView })));
const OpenRouterRankingsView = lazy(() =>
  import("./openrouter-rankings-view").then((m) => ({ default: m.OpenRouterRankingsView })),
);
const RankingViewsModule = {
  OpenSource: lazy(() => import("./open-source-view").then((m) => ({ default: m.OpenSourceRankingsView }))),
  Hallucination: lazy(() => import("./hallucination-view").then((m) => ({ default: m.HallucinationRankingsView }))),
  Agent: lazy(() => import("./agent-view").then((m) => ({ default: m.AgentRankingsView }))),
};

const TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: MODEL_SOURCES.aa.sourceLabelKey,
  openRouterRankings: MODEL_SOURCES.or.sourceLabelKey,
  openSourceRankings: MODEL_SOURCES.os.sourceLabelKey,
  hallucinationRankings: MODEL_SOURCES.hall.sourceLabelKey,
  agentRankings: "agentSource",
  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

function defineRankingsTab<T>(useRankings: () => T, View: ComponentType<{ rankings: T }>): ComponentType {
  return memo(function RankingsTab() {
    const rankings = useRankings();
    return <View rankings={rankings} />;
  });
}

const ModelRankingsTab = memo(function ModelRankingsTab() {
  const { items, partial } = useSuspenseArtificialRankingsState();
  return (
    <>
      {partial && <PartialNotice />}
      <ArtificialAnalysisView rankings={items} />
    </>
  );
});
const OpenSourceTab = defineRankingsTab(useSuspenseOpenSourceModels, RankingViewsModule.OpenSource);

/** When the `/omniscience` enrichment leg fails every row loses its breakdown and the
 *  table renders empty, so the payload's `partial` flag must show a notice. */
const HallucinationRankingsTab = memo(function HallucinationRankingsTab() {
  const { items, partial } = useSuspenseArtificialRankingsState();
  const rankings = useHallucinationRankings(items);
  return (
    <>
      {partial && <PartialNotice />}
      <RankingViewsModule.Hallucination rankings={rankings} />
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
  const { items, partial } = useSuspenseArtificialRankingsState();
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
      <SuspenseQuery resetKey={activeTabId}>
        <ActiveContent />
      </SuspenseQuery>
    </TabbedPage>
  );
}
