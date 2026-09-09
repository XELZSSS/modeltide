"use client";
import { lazy, memo, useMemo, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import {
  useSuspenseArtificialRankings,
  useSuspenseOpenSourceModels,
  useSuspenseOpenRouterRankings,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/feedback";
import { SearchInput } from "@/client/search/SearchInput";
import { Dot } from "@/client/components/ui/primitives";
import { type TabItem } from "@/client/components/ui/tabs";
import { TabbedPage } from "@/client/components/layout";
import { useClientTab } from "@/client/hooks/use-client-tab";
import { indexRankMap, rankCol, type DataTableColumn } from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { formatScore, formatPricePerMillion, formatSpeed } from "@/client/utils/format";
import { computeProviderStats, type ProviderStats } from "@/client/utils/model";
import { RANKING_TABS, type RankingTabId } from "@/shared/config";
import { MODEL_SOURCES } from "@/shared/config";

const ArtificialAnalysisView = lazy(() =>
  import("./ArtificialAnalysisView").then((m) => ({ default: m.ArtificialAnalysisView })),
);
const OpenRouterRankingsView = lazy(() =>
  import("./OpenRouterRankingsView").then((m) => ({ default: m.OpenRouterRankingsView })),
);
const RankingViewsModule = {
  OpenSource: lazy(() => import("./OpenSourceView").then((m) => ({ default: m.OpenSourceRankingsView }))),
  Hallucination: lazy(() => import("./HallucinationView").then((m) => ({ default: m.HallucinationRankingsView }))),
  Agent: lazy(() => import("./AgentView").then((m) => ({ default: m.AgentRankingsView }))),
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
  const rankings = useSuspenseArtificialRankings();
  return <ArtificialAnalysisView rankings={rankings} />;
});

const OpenRouterTab = memo(function OpenRouterTab() {
  const { data } = useSuspenseOpenRouterRankings();
  return <OpenRouterRankingsView data={data} />;
});

const OpenSourceTab = memo(function OpenSourceTab() {
  const rankings = useSuspenseOpenSourceModels();
  const View = RankingViewsModule.OpenSource;
  return <View rankings={rankings} />;
});

const HallucinationRankingsTab = memo(function HallucinationRankingsTab() {
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const View = RankingViewsModule.Hallucination;
  return <View rankings={hallucinationRankings} />;
});

const AgentRankingsTab = memo(function AgentRankingsTab() {
  const View = RankingViewsModule.Agent;
  return <View />;
});

const getProviderRowId = (p: ProviderStats) => p.name;
const getProviderSearchFields = (p: ProviderStats) => [p.name];

function providerMonoCol(
  id: string,
  header: string,
  format: (p: ProviderStats) => ReactNode,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<ProviderStats> {
  return { id, header, align: "right", cell: (p) => <span className="ui-mono-value">{format(p)}</span>, ...opts };
}

const ProviderCompareTab = memo(function ProviderCompareTab() {
  const data = useSuspenseArtificialRankings();
  const { t } = useTranslation();
  const providerStats = useMemo(() => computeProviderStats(data, t("unknown")), [data, t]);
  const rankMap = useMemo(() => indexRankMap(providerStats, getProviderRowId), [providerStats]);
  const columns = useMemo<DataTableColumn<ProviderStats>[]>(
    () => [
      rankCol((p: ProviderStats) => rankMap.get(getProviderRowId(p)) ?? null),
      {
        id: "name",
        header: t("provider"),
        cell: (p) => (
          <div className="flex items-center gap-2 min-w-0">
            <Dot color={p.color} />
            <span className="font-medium text-sm truncate min-w-0">{p.name}</span>
          </div>
        ),
      },
      providerMonoCol("count", t("modelCount"), (p) => p.count),
      providerMonoCol("avgIntelligence", t("avgIntelligence"), (p) => formatScore(t, p.avgIntelligence), {
        mobilePrimary: true,
      }),
      providerMonoCol("avgPrice", t("avgPrice"), (p) => formatPricePerMillion(p.avgPrice, t), { hiddenMd: true }),
      {
        id: "avgSpeed",
        header: t("avgSpeed"),
        align: "right",
        hiddenMd: true,
        cell: (p) => (
          <span className="text-sm text-text-primary">
            {p.avgSpeed != null ? `${formatSpeed(t, p.avgSpeed)} ${t("tokensPerSecond")}` : t("notAvailable")}
          </span>
        ),
      },
    ],
    [t, rankMap],
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

function RankingsContent() {
  const { t } = useTranslation();
  const [activeTabId, handleTabChange] = useClientTab("tab", RANKING_TABS, RANKING_TABS[0]);
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

export function RankingsHubView() {
  return <RankingsContent />;
}
