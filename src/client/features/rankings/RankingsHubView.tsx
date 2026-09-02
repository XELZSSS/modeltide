import { lazy, memo, Suspense, useMemo, type ComponentType } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import {
  useSuspenseArtificialRankings,
  useSuspenseOpenSourceModels,
  useSuspenseOpenRouterRankings,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { SuspenseQuery, Spinner } from "@/client/components/shared";
import { SearchInput } from "@/client/search";
import { Dot, type TabItem } from "@/client/components/ui";
import { TabbedPage } from "@/client/components/layout";
import { useUrlTab } from "@/client/hooks";
import { DataTable, type DataTableColumn } from "@/client/components/data";
import {
  formatScore,
  formatPricePerMillion,
  formatSpeed,
  computeProviderStats,
  type ProviderStats,
} from "@/client/utils";
import {
  RANKING_TABS,
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
  providerCompare: MODEL_SOURCES.aa.sourceLabelKey,
};

const ModelRankingsTab = memo(function ModelRankingsTab() {
  const { data } = useSuspenseArtificialRankings();
  return (
    <Suspense fallback={<Spinner />}>
      <ArtificialAnalysisView rankings={data} />
    </Suspense>
  );
});

const OpenRouterTab = memo(function OpenRouterTab() {
  const { data } = useSuspenseOpenRouterRankings();
  return (
    <Suspense fallback={<Spinner />}>
      <OpenRouterRankingsView data={data} />
    </Suspense>
  );
});

const OpenSourceTab = memo(function OpenSourceTab() {
  const { data } = useSuspenseOpenSourceModels();
  return <OpenSourceRankingsView rankings={data} />;
});

const HallucinationRankingsTab = memo(function HallucinationRankingsTab() {
  const hallucinationRankings = useSuspenseHallucinationRankings();
  return <HallucinationRankingsView rankings={hallucinationRankings} />;
});

const getProviderRowId = (p: ProviderStats) => p.name;

const ProviderCompareTab = memo(function ProviderCompareTab() {
  const { data } = useSuspenseArtificialRankings();
  const { t } = useTranslation();
  const providerStats = useMemo(() => computeProviderStats(data), [data]);
  const columns = useMemo<DataTableColumn<ProviderStats>[]>(
    () => [
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
      {
        id: "count",
        header: t("modelCount"),
        align: "right",
        cell: (p) => <span className="font-medium">{p.count}</span>,
      },
      {
        id: "avgIntelligence",
        header: t("avgIntelligence"),
        align: "right",
        cell: (p) => formatScore(t, p.avgIntelligence),
      },
      {
        id: "avgPrice",
        header: t("avgPrice"),
        align: "right",
        hiddenMd: true,
        cell: (p) => formatPricePerMillion(p.avgPrice, t),
      },
      {
        id: "avgSpeed",
        header: t("avgSpeed"),
        align: "right",
        hiddenMd: true,
        cell: (p) => (p.avgSpeed != null ? `${formatSpeed(t, p.avgSpeed)} ${t("tokensPerSecond")}` : t("notAvailable")),
      },
    ],
    [t],
  );
  return <DataTable columns={columns} data={providerStats} getRowId={getProviderRowId} />;
});

const TAB_COMPONENTS: Record<RankingTabId, ComponentType> = {
  modelRankings: ModelRankingsTab,
  openRouterRankings: OpenRouterTab,
  openSourceRankings: OpenSourceTab,
  hallucinationRankings: HallucinationRankingsTab,
  providerCompare: ProviderCompareTab,
};

function RankingsContent() {
  const { t } = useTranslation();
  // The active tab lives in the URL (`?tab=`) so back navigation from detail pages,
  // deep links and refreshes all restore the tab the user was actually on.
  const [activeTabId, handleTabChange] = useUrlTab(RANKING_TABS, RANKING_TABS[0]);
  const tabs: TabItem[] = useMemo(() => RANKING_TABS.map((id) => ({ id, label: t(id) })), [t]);
  const ActiveContent = TAB_COMPONENTS[activeTabId];

  return (
    <TabbedPage
      containerClassName="pt-3 sm:pt-4"
      compact
      title={t(activeTabId)}
      description={t(TAB_SOURCE_LABEL[activeTabId])}
      actions={<SearchInput />}
      tabs={tabs}
      activeTab={activeTabId}
      tabSize="md"
      tabClassName="gap-3 sm:gap-4"
      onTabChange={handleTabChange}
    >
      <ActiveContent />
    </TabbedPage>
  );
}

/** Rankings hub with tabs for model rankings, OpenRouter usage, open-source models, hallucination benchmarks and provider comparison. */
export function RankingsHubView() {
  return (
    <SuspenseQuery>
      <RankingsContent />
    </SuspenseQuery>
  );
}
