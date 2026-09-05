import { lazy, memo, useMemo, type ComponentType, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import {
  useSuspenseArtificialRankings,
  useSuspenseOpenSourceModels,
  useSuspenseOpenRouterRankings,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { SuspenseQuery } from "@/client/components/shared";
import { SearchInput } from "@/client/search";
import { Dot, type TabItem } from "@/client/components/ui";
import { TabbedPage } from "@/client/components/layout";
import { useUrlTab } from "@/client/hooks";
import { SearchableDataTable, indexRankMap, rankCol, type DataTableColumn } from "@/client/components/data";
import {
  formatScore,
  formatPricePerMillion,
  formatSpeed,
  computeProviderStats,
  type ProviderStats,
} from "@/client/utils";
import {
  RANKING_TABS,
  ArenaRankingsView,
  BenchmarkBoardView,
  OpenSourceRankingsView,
  HallucinationRankingsView,
  type RankingTabId,
} from "@/client/features/rankings/RankingViews";
import { MODEL_SOURCES } from "@/shared/config";

const ArtificialAnalysisView = lazy(() =>
  import("./ArtificialAnalysisView").then((m) => ({ default: m.ArtificialAnalysisView })),
);
const OpenRouterRankingsView = lazy(() =>
  import("./OpenRouterRankingsView").then((m) => ({ default: m.OpenRouterRankingsView })),
);

const TAB_SOURCE_LABEL: Record<RankingTabId, TranslationKey> = {
  modelRankings: MODEL_SOURCES.aa.sourceLabelKey,
  openRouterRankings: MODEL_SOURCES.or.sourceLabelKey,
  openSourceRankings: MODEL_SOURCES.os.sourceLabelKey,
  hallucinationRankings: MODEL_SOURCES.hall.sourceLabelKey,
  benchmarkRankings: "arenaSource",
  arenaRankings: "arenaSource",
  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

const ModelRankingsTab = memo(function ModelRankingsTab() {
  const { data } = useSuspenseArtificialRankings();
  return <ArtificialAnalysisView rankings={data} />;
});

const OpenRouterTab = memo(function OpenRouterTab() {
  const { data } = useSuspenseOpenRouterRankings();
  return <OpenRouterRankingsView data={data} />;
});

const OpenSourceTab = memo(function OpenSourceTab() {
  const { data } = useSuspenseOpenSourceModels();
  return <OpenSourceRankingsView rankings={data} />;
});

const HallucinationRankingsTab = memo(function HallucinationRankingsTab() {
  const hallucinationRankings = useSuspenseHallucinationRankings();
  return <HallucinationRankingsView rankings={hallucinationRankings} />;
});

const BenchmarkRankingsTab = memo(function BenchmarkRankingsTab() {
  return <BenchmarkBoardView />;
});

const ArenaRankingsTab = memo(function ArenaRankingsTab() {
  return <ArenaRankingsView />;
});

const getProviderRowId = (p: ProviderStats) => p.name;

// Right-aligned mono stat cell.
function providerMonoCol(
  id: string,
  header: string,
  format: (p: ProviderStats) => ReactNode,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<ProviderStats> {
  return { id, header, align: "right", cell: (p) => <span className="ui-mono-value">{format(p)}</span>, ...opts };
}

const ProviderCompareTab = memo(function ProviderCompareTab() {
  const { data } = useSuspenseArtificialRankings();
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
      getSearchFields={(p) => [p.name]}
    />
  );
});

const TAB_COMPONENTS: Record<RankingTabId, ComponentType> = {
  modelRankings: ModelRankingsTab,
  openRouterRankings: OpenRouterTab,
  openSourceRankings: OpenSourceTab,
  hallucinationRankings: HallucinationRankingsTab,
  benchmarkRankings: BenchmarkRankingsTab,
  arenaRankings: ArenaRankingsTab,
  providerCompare: ProviderCompareTab,
};

function RankingsContent() {
  const { t } = useTranslation();
  // Tab lives in ?tab= so back-nav, deep links and refreshes restore it.
  const [activeTabId, handleTabChange] = useUrlTab(RANKING_TABS, RANKING_TABS[0]);
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
      {/* Only the tab body suspends; the tab bar stays interactive on switch. */}
      <SuspenseQuery resetKey={activeTabId}>
        <ActiveContent />
      </SuspenseQuery>
    </TabbedPage>
  );
}

/** Rankings hub: model / usage / open-source / hallucination / benchmark / arena / provider tabs. */
export function RankingsHubView() {
  return <RankingsContent />;
}
