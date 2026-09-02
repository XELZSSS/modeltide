import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";

import { SearchableDataTable } from "@/client/components/data";
import { useTranslation } from "@/client/providers";
import { useCompareStore } from "@/client/stores";
import { useMonthlyCosts } from "@/client/components/compare/useCostEstimator";
import { modelId } from "@/client/utils";
import { TabButton, SegmentedGroup } from "@/client/components/ui";
import { CompareChipBar, useCompareModels } from "@/client/components/compare";
import { CostEstimatorInputs } from "@/client/components/compare/CostEstimatorInputs";

import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildRankingColumns, buildPricingColumns, ModelExpandedDetail } from "@/client/features/rankings/aaColumns";

type ViewMode = "rankings" | "pricing";

interface PricingRow {
  model: ArtificialAnalysisModel;
  monthlyCost: number | null;
}

/** Stable search-field selector: a fresh callback each render would defeat useFilteredData's memo. */
const getAASearchFields = (model: ArtificialAnalysisModel) => [
  model.name,
  model.slug,
  model.model_creators?.name ?? "",
];

const getAARowId = (model: ArtificialAnalysisModel) => modelId(model);
const getPricingRowId = (row: PricingRow) => modelId(row.model);
const getPricingSearchFields = (row: PricingRow) => getAASearchFields(row.model);

// Module-level renderers keep prop identity stable so the memoized table body
// is not re-rendered on every parent render (search typing, cost input, ...).
const renderModelDetail = (model: ArtificialAnalysisModel) => <ModelExpandedDetail model={model} />;
const renderPricingDetail = (row: PricingRow) => <ModelExpandedDetail model={row.model} />;

function FilterToolbar({
  viewMode,
  onViewModeChange,
}: {
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-wrap items-center gap-1.5 min-w-0">
      {/* View-mode switch, not tabs: radiogroup semantics (role="tab" requires a tablist). */}
      <SegmentedGroup className="overflow-x-auto no-scrollbar" role="radiogroup" aria-label={t("viewMode")}>
        <TabButton role="radio" active={viewMode === "rankings"} onClick={() => onViewModeChange("rankings")}>
          {t("modelRankings")}
        </TabButton>
        <TabButton role="radio" active={viewMode === "pricing"} onClick={() => onViewModeChange("pricing")}>
          {t("pricing")}
        </TabButton>
      </SegmentedGroup>
    </div>
  );
}

/**
 * Artificial Analysis rankings/pricing tables with compare support and
 * estimated monthly costs.
 */
export function ArtificialAnalysisView({ rankings }: { rankings: ArtificialAnalysisModel[] }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();
  const toggleCompareModel = useCompareStore((s) => s.toggleCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  // Restore the last-used view mode when navigating back (e.g. from the compare page).
  const [viewMode, setViewMode] = useState<ViewMode>(
    (location.state as { viewMode?: ViewMode })?.viewMode ?? "rankings",
  );

  const { monthlyCosts, ...costInputs } = useMonthlyCosts(rankings);
  const comparedModels = useCompareModels(rankings);

  const avgCost = useMemo(() => {
    const valid = monthlyCosts.filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }, [monthlyCosts]);

  const compareIds = useCompareStore((s) => s.compareIds);
  const compareSet = useMemo(() => new Set(compareIds), [compareIds]);
  const rankingColumns = useMemo(
    () => buildRankingColumns(t, compareSet, toggleCompareModel),
    [t, compareSet, toggleCompareModel],
  );
  const pricingColumns = useMemo(
    () => buildPricingColumns(t, compareSet, toggleCompareModel),
    [t, compareSet, toggleCompareModel],
  );

  const pricingRows = useMemo(
    () => rankings.map((model, index) => ({ model, monthlyCost: monthlyCosts[index] ?? null })),
    [rankings, monthlyCosts],
  );

  return (
    <div className="flex flex-col gap-3">
      <FilterToolbar viewMode={viewMode} onViewModeChange={setViewMode} />

      {viewMode === "pricing" && (
        <div className="flex gap-3 flex-wrap items-center">
          <CostEstimatorInputs state={costInputs} layout="input-label" avgCost={avgCost} />
        </div>
      )}

      <CompareChipBar
        models={comparedModels}
        onRemove={(model) => toggleCompareModel(model)}
        onClear={clearCompare}
        onCompare={() => navigate(viewMode === "pricing" ? "/price-compare" : "/compare")}
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
