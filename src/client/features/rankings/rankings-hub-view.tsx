import { lazy, memo, useMemo, type ComponentType } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import {
  useSuspenseArtificialRankings,
  useSuspenseArtificialRankingsState,
  useSuspenseOpenSourceModels,
  useSuspenseOpenRouterRankings,
  useSuspenseHallucinationRankings,
} from "@/client/api/api-queries";
import { PartialNotice, SuspenseQuery } from "@/client/components/feedback";
import { SearchInput } from "@/client/search/search-input";
import { type TabItem } from "@/client/components/ui/tabs";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table-columns";
import { LabeledDot } from "@/client/components/ui/primitives";
import { SearchableDataTable } from "@/client/components/data/table";
import { formatScore, formatPricePerMillion, formatSpeed } from "@/client/utils/format";
import { computeProviderStats, type ProviderStats } from "@/client/utils/model-utils";
import { useOfficialPricing } from "@/client/pricing/official-pricing-hook";
import { MODEL_SOURCES, RANKING_TABS, type RankingTabId } from "@/client/config/nav-config";

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

/** Same-shaped tabs (query → `<View rankings>`) share one factory; tabs that need
 *  extra props or chrome stay hand-written below. */
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
const HallucinationRankingsTab = defineRankingsTab(useSuspenseHallucinationRankings, RankingViewsModule.Hallucination);

const OpenRouterTab = memo(function OpenRouterTab() {
  const { data } = useSuspenseOpenRouterRankings();
  return <OpenRouterRankingsView data={data} />;
});

const AgentRankingsTab = RankingViewsModule.Agent;

const getProviderRowId = (p: ProviderStats) => p.name;
const getProviderSearchFields = (p: ProviderStats) => [p.name];

const ProviderCompareTab = memo(function ProviderCompareTab() {
  const data = useSuspenseArtificialRankings();
  const { getOfficial } = useOfficialPricing();
  const { t } = useTranslation();
  const providerStats = useMemo(() => computeProviderStats(data, t("unknown"), getOfficial), [data, t, getOfficial]);
  const columns = useMemo<DataTableColumn<ProviderStats>[]>(
    () => [
      {
        id: "name",
        header: t("provider"),
        cell: (p) => <LabeledDot color={p.color}>{p.name}</LabeledDot>,
      },
      monoCol("count", t("modelCount"), (p) => p.count),
      monoCol("avgIntelligence", t("avgIntelligence"), (p) => formatScore(t, p.avgIntelligence), {
        mobilePrimary: true,
      }),
      monoCol("avgPrice", t("avgPrice"), (p) => formatPricePerMillion(p.avgPrice, t), { hiddenMd: true }),
      rightCol(
        "avgSpeed",
        t("avgSpeed"),
        (p) => (
          <span className="text-sm text-text-primary">
            {p.avgSpeed != null ? `${formatSpeed(t, p.avgSpeed)} ${t("tokensPerSecond")}` : t("notAvailable")}
          </span>
        ),
        { hiddenMd: true },
      ),
    ],
    [t],
  );
  return (
    <SearchableDataTable
      columns={columns}
      data={providerStats}
      getRowId={getProviderRowId}
      getSearchFields={getProviderSearchFields}
    />
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
  const [activeTabId, handleTabChange] = useClientTab("tab", RANKING_TABS, RANKING_TABS[0]);
  const tabs: TabItem[] = useMemo(() => RANKING_TABS.map((id) => ({ id, label: t(id) })), [t]);
  const ActiveContent = TAB_COMPONENTS[activeTabId];

  return (
    <TabbedPage
      compact
      title={t(activeTabId)}
      kicker={t("kickerRankings")}
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
