import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "@/client/router";
import { useTranslation } from "@/client/providers";
import { useClientTab } from "@/client/hooks/use-client-tab";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelId } from "@/client/utils/model-utils";
import { SearchableDataTable } from "@/client/components/data/table";
import { useCompareModels, useCompareStore } from "@/client/stores";
import { useEffectivePricingMap, useMonthlyCosts } from "@/client/pricing/cost-inputs";
import { CostEstimatorInputs } from "@/client/pricing/cost-form";
import { useOfficialPricing } from "@/client/pricing/official-pricing-hook";
import { CompareChipBar } from "@/client/features/compare/compare-tray";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { ModelExpandedDetail } from "@/client/features/rankings/aa/aa-cells";
import { buildRankingColumns } from "@/client/features/rankings/aa/aa-rank-columns";
import { buildPricingColumns, type PricingRow } from "@/client/features/rankings/aa/aa-price-columns";
import { SegmentedGroup } from "@/client/components/ui/grids";
import { TabButton } from "@/client/components/ui/tabs";

const VIEW_MODES = ["rankings", "pricing"] as const;

/** Stable empty identity: a fresh `[]` literal per render defeated the pricing memos. */
const EMPTY_MODELS: ArtificialAnalysisModel[] = [];

const getAARowId = (model: ArtificialAnalysisModel) => modelId(model);
const getPricingRowId = (row: PricingRow) => modelId(row.model);
const getPricingSearchFields = (row: PricingRow) => SEARCH_FIELDS.aa(row.model);

const renderModelDetail = (model: ArtificialAnalysisModel) => <ModelExpandedDetail model={model} />;
const renderPricingDetail = (row: PricingRow) => <ModelExpandedDetail model={row.model} />;

export function ArtificialAnalysisView({ rankings }: { rankings: ArtificialAnalysisModel[] }) {
  const { push: navigate } = useRouter();
  const { t } = useTranslation();
  const toggleCompareModel = useCompareStore((s) => s.toggleCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const pruneCompare = useCompareStore((s) => s.pruneCompare);
  const [viewMode, setViewMode] = useClientTab("view", VIEW_MODES, VIEW_MODES[0]);

  const { getOfficial, isPending: officialPending } = useOfficialPricing(viewMode === "pricing");
  const pricingMode = viewMode === "pricing";
  const pricingReady = !pricingMode || !officialPending;
  const effectivePricingMap = useEffectivePricingMap(
    pricingMode ? rankings : EMPTY_MODELS,
    pricingMode ? getOfficial : undefined,
  );
  const { monthlyCosts, ...costInputs } = useMonthlyCosts(
    pricingMode ? rankings : EMPTY_MODELS,
    pricingMode ? getOfficial : undefined,
    {
      ready: pricingReady,
    },
  );
  const comparedModels = useCompareModels(rankings);

  useEffect(() => {
    // Stale ids still count against MAX_COMPARE in the store, and this list owns the
    // + buttons, so the removal has to happen here too, not only on the compare page.
    const validIds = new Set(rankings.map(modelId).filter(Boolean));
    if (validIds.size === 0) return;
    pruneCompare(validIds);
  }, [rankings, pruneCompare]);

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
  const handleCompare = useCallback(
    () => navigate(pricingMode ? "/price-compare" : "/compare"),
    [navigate, pricingMode],
  );
  const pricingLeading = useMemo(
    () => (pricingMode ? <p className="text-xs text-text-tertiary">{t("pricingDisclaimer")}</p> : undefined),
    [pricingMode, t],
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

      {pricingMode && (
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
      {pricingMode ? (
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
          getSearchFields={SEARCH_FIELDS.aa}
          renderExpandedRow={renderModelDetail}
        />
      )}
    </div>
  );
}
