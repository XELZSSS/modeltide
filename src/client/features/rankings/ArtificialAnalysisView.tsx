"use client";
import { useCallback, useMemo } from "react";
import { useRouter } from "@/client/router";
import { useTranslation } from "@/client/providers";
import { useClientTab } from "@/client/hooks/use-client-tab";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelId } from "@/client/utils/model";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { useCompareModels, useCompareStore } from "@/client/stores";
import { useEffectivePricingMap, useMonthlyCosts } from "@/client/features/pricing/cost-inputs";
import { CostEstimatorInputs } from "@/client/features/pricing/inputs";
import { useOfficialPricing } from "@/client/features/pricing/official";
import { CompareChipBar } from "@/client/components/compare-tray";
import { ModelExpandedDetail } from "@/client/features/rankings/aa/cells";
import { buildRankingColumns } from "@/client/features/rankings/aa/columns-rank";
import { buildPricingColumns, type PricingRow } from "@/client/features/rankings/aa/columns-price";
import { SegmentedGroup } from "@/client/components/ui/grids";
import { TabButton } from "@/client/components/ui/tabs";

const VIEW_MODES = ["rankings", "pricing"] as const;

const getAASearchFields = (model: ArtificialAnalysisModel) => [
  model.name,
  model.slug,
  model.model_creators?.name ?? "",
];

const getAARowId = (model: ArtificialAnalysisModel) => modelId(model);
const getPricingRowId = (row: PricingRow) => modelId(row.model);
const getPricingSearchFields = (row: PricingRow) => getAASearchFields(row.model);

const renderModelDetail = (model: ArtificialAnalysisModel) => <ModelExpandedDetail model={model} />;
const renderPricingDetail = (row: PricingRow) => <ModelExpandedDetail model={row.model} />;

export function ArtificialAnalysisView({ rankings }: { rankings: ArtificialAnalysisModel[] }) {
  const router = useRouter();
  const navigate = (to: string) => router.push(to);
  const { t } = useTranslation();
  const toggleCompareModel = useCompareStore((s) => s.toggleCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const [viewMode, setViewMode] = useClientTab("view", VIEW_MODES, VIEW_MODES[0]);

  const { getOfficial, isPending: officialPending } = useOfficialPricing(viewMode === "pricing");
  const pricingMode = viewMode === "pricing";
  const pricingReady = !pricingMode || !officialPending;
  const effectivePricingMap = useEffectivePricingMap(
    pricingMode ? rankings : [],
    pricingMode ? getOfficial : undefined,
  );
  const { monthlyCosts, ...costInputs } = useMonthlyCosts(
    pricingMode ? rankings : [],
    pricingMode ? getOfficial : undefined,
    {
      ready: pricingReady,
    },
  );
  const comparedModels = useCompareModels(rankings);

  const avgCost = useMemo(() => {
    const valid = [...monthlyCosts.values()].filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : null;
  }, [monthlyCosts]);

  const compareIds = useCompareStore((s) => s.compareIds);
  const compareSet = useMemo(() => new Set(compareIds), [compareIds]);
  const rankingColumns = useMemo(
    () => [...buildRankingColumns(t, compareSet, toggleCompareModel)],
    [t, compareSet, toggleCompareModel],
  );
  const pricingColumns = useMemo(
    () => [
      ...buildPricingColumns(t, compareSet, toggleCompareModel, effectivePricingMap, getOfficial, {
        pending: !pricingReady,
      }),
    ],
    [t, compareSet, toggleCompareModel, effectivePricingMap, getOfficial, pricingReady],
  );

  const pricingRows = useMemo(
    () => rankings.map((model) => ({ model, monthlyCost: monthlyCosts.get(modelId(model)) ?? null })),
    [rankings, monthlyCosts],
  );
  // toggleCompareModel from the store is already referentially stable — no wrapper needed.
  const handleCompare = useCallback(
    () => navigate(viewMode === "pricing" ? "/price-compare" : "/compare"),
    [navigate, viewMode],
  );
  const pricingLeading = useMemo(
    () => (viewMode === "pricing" ? <p className="text-xs text-text-tertiary">{t("pricingDisclaimer")}</p> : undefined),
    [viewMode, t],
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <SegmentedGroup className="overflow-x-auto no-scrollbar" role="radiogroup" aria-label={t("viewMode")}>
          {(
            [
              { id: "rankings", label: t("modelRankings") },
              { id: "pricing", label: t("pricing") },
            ] as const
          ).map((item) => (
            <TabButton key={item.id} role="radio" active={viewMode === item.id} onClick={() => setViewMode(item.id)}>
              {item.label}
            </TabButton>
          ))}
        </SegmentedGroup>
      </div>

      {viewMode === "pricing" && (
        <div className="flex gap-4 flex-wrap items-center">
          <CostEstimatorInputs state={costInputs} layout="input-label" avgCost={avgCost} pending={!pricingReady} />
        </div>
      )}

      <CompareChipBar
        models={comparedModels}
        onRemove={toggleCompareModel}
        onClear={clearCompare}
        onCompare={handleCompare}
        leading={pricingLeading}
      />
      {viewMode === "pricing" ? (
        <SearchableDataTable
          data={pricingRows}
          columns={pricingColumns}
          getRowId={getPricingRowId}
          getSearchFields={getPricingSearchFields}
          renderExpandedRow={renderPricingDetail}
        />
      ) : (
        <SearchableDataTable
          data={rankings}
          columns={rankingColumns}
          getRowId={getAARowId}
          getSearchFields={getAASearchFields}
          renderExpandedRow={renderModelDetail}
        />
      )}
    </div>
  );
}
