import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { useTranslation } from "@/client/providers";
import { useUrlParam } from "@/client/ui-hooks";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelId } from "@/client/utils/model";
import { indexRankMap, rankCol } from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { useCompareModels, useCompareStore } from "@/client/stores";
import { useMonthlyCosts } from "@/client/features/pricing/cost-inputs";
import { CostEstimatorInputs } from "@/client/features/pricing/inputs";
import { useOfficialPricing } from "@/client/features/pricing/official";
import { CompareChipBar } from "@/client/components/compare-tray";
import { ModelExpandedDetail } from "@/client/features/rankings/aa/cells";
import { buildRankingColumns } from "@/client/features/rankings/aa/columns-rank";
import { buildPricingColumns, type PricingRow } from "@/client/features/rankings/aa/columns-price";
import { RadioToolbar } from "@/client/components/ui/tabs";

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
  const navigate = useNavigate();
  const { t } = useTranslation();
  const toggleCompareModel = useCompareStore((s) => s.toggleCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const [viewMode, setViewMode] = useUrlParam("view", VIEW_MODES, VIEW_MODES[0]);

  const { getOfficial } = useOfficialPricing(viewMode === "pricing");
  const { monthlyCosts, ...costInputs } = useMonthlyCosts(
    viewMode === "pricing" ? rankings : [],
    viewMode === "pricing" ? getOfficial : undefined,
  );
  const comparedModels = useCompareModels(rankings);

  const avgCost = useMemo(() => {
    const valid = monthlyCosts.filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }, [monthlyCosts]);

  const compareIds = useCompareStore((s) => s.compareIds);
  const compareSet = useMemo(() => new Set(compareIds), [compareIds]);
  const rankMap = useMemo(() => indexRankMap(rankings, (m) => modelId(m)), [rankings]);
  const rankingColumns = useMemo(
    () => [
      rankCol((m: ArtificialAnalysisModel) => rankMap.get(modelId(m)) ?? null),
      ...buildRankingColumns(t, compareSet, toggleCompareModel),
    ],
    [t, compareSet, toggleCompareModel, rankMap],
  );
  const pricingColumns = useMemo(
    () => [
      rankCol((row: PricingRow) => rankMap.get(modelId(row.model)) ?? null),
      ...buildPricingColumns(t, compareSet, toggleCompareModel, getOfficial),
    ],
    [t, compareSet, toggleCompareModel, rankMap, getOfficial],
  );

  const pricingRows = useMemo(
    () => rankings.map((model, index) => ({ model, monthlyCost: monthlyCosts[index] ?? null })),
    [rankings, monthlyCosts],
  );
  const handleRemove = useCallback((model: ArtificialAnalysisModel) => toggleCompareModel(model), [toggleCompareModel]);
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
      <RadioToolbar
        label={t("viewMode")}
        items={[
          { id: "rankings", label: t("modelRankings") },
          { id: "pricing", label: t("pricing") },
        ]}
        value={viewMode}
        onChange={setViewMode}
      />

      {viewMode === "pricing" && (
        <div className="flex gap-4 flex-wrap items-center">
          <CostEstimatorInputs state={costInputs} layout="input-label" avgCost={avgCost} />
        </div>
      )}

      <CompareChipBar
        models={comparedModels}
        onRemove={handleRemove}
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
