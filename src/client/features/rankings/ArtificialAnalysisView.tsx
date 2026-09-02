import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";

import { DataTable } from "@/client/components/data";
import { useTranslation } from "@/client/providers";
import { useCompareStore } from "@/client/stores";
import { useFilteredData } from "@/client/hooks";
import { modelId } from "@/client/utils";
import { TabButton, SegmentedGroup } from "@/client/components/ui";
import { CompareChipBar, useCompareModels } from "@/client/components/compare";
import { CostEstimatorInputs } from "@/client/components/compare/CostEstimatorInputs";
import { useMonthlyCosts } from "@/client/components/compare/useCostEstimator";

import type { ArtificialAnalysisModel } from "@/shared/types";
import { buildRankingColumns, buildPricingColumns, ModelExpandedDetail } from "@/client/features/rankings/aaColumns";

type ViewMode = "rankings" | "pricing";

function useAARankingFilters(rankings: ArtificialAnalysisModel[]) {
  const location = useLocation();
  // Restore the last-used view mode when navigating back (e.g. from the compare page).
  const [viewMode, setViewMode] = useState<ViewMode>(
    (location.state as { viewMode?: ViewMode })?.viewMode ?? "rankings",
  );

  // Stable identity: a fresh callback each render would defeat useFilteredData's
  // memo, changing `filtered`'s identity on every render and collapsing expanded rows.
  const getSearchFields = useCallback(
    (model: ArtificialAnalysisModel) => [model.name, model.slug, model.model_creators?.name ?? ""],
    [],
  );
  const filtered = useFilteredData(rankings, getSearchFields);

  return { filtered, viewMode, setViewMode };
}

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
      <SegmentedGroup className="overflow-x-auto no-scrollbar">
        <TabButton active={viewMode === "rankings"} onClick={() => onViewModeChange("rankings")}>
          {t("modelRankings")}
        </TabButton>
        <TabButton active={viewMode === "pricing"} onClick={() => onViewModeChange("pricing")}>
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
  const { t } = useTranslation();
  const toggleCompareModel = useCompareStore((s) => s.toggleCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);

  const { filtered, viewMode, setViewMode } = useAARankingFilters(rankings);
  const { monthlyCosts, ...costInputs } = useMonthlyCosts(filtered);
  const comparedModels = useCompareModels(rankings);

  useEffect(() => {
    setExpandedRowId(null);
  }, [viewMode, filtered]);

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
    () => filtered.map((model, index) => ({ model, monthlyCost: monthlyCosts[index] ?? null })),
    [filtered, monthlyCosts],
  );

  // Expansion/pagination behavior is identical across the pricing and rankings tables.
  const tableExpansion = {
    expandedRowId,
    onToggleExpand: setExpandedRowId,
    onPageChange: () => setExpandedRowId(null),
  } as const;

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
        <DataTable
          data={pricingRows}
          columns={pricingColumns}
          getRowId={(row) => modelId(row.model)}
          renderExpandedRow={(row) => <ModelExpandedDetail model={row.model} />}
          {...tableExpansion}
        />
      ) : (
        <DataTable
          data={filtered}
          columns={rankingColumns}
          getRowId={modelId}
          renderExpandedRow={(model) => <ModelExpandedDetail model={model} />}
          {...tableExpansion}
        />
      )}
    </div>
  );
}
