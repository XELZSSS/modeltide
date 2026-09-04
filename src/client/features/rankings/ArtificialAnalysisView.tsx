import { Lightbulb, Plus, Check } from "lucide-react";
import {
  RightAlignedText,
  RankingNameCell,
  textCol,
  rightCol,
  rightColNA,
  mobilePrimaryCol,
  type DataTableColumn,
  SearchableDataTable,
  indexRankMap,
  rankCol,
} from "@/client/components/data";
import { Button, TabButton, SegmentedGroup } from "@/client/components/ui";
import { ModelDetailContent } from "@/client/features/models/ModelDetailView";
import {
  formatScore,
  formatDollar,
  formatTokens,
  modelId,
  indexOfficialPricing,
  matchOfficialPricing,
  resolveEffectivePricing,
  resolveBlendedPrice,
  type OfficialGetter,
} from "@/client/utils";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";
import { useTranslation } from "@/client/providers";
import { useMemo, useState } from "react";
import { useNavigate, useLocation } from "react-router";
import { useCompareStore, useCompareModels } from "@/client/stores";
import { useMonthlyCosts } from "@/client/features/compare/pricing";
import { qOfficialPricing } from "@/client/api/queries";
import { CompareChipBar } from "@/client/features/compare/CompareChipBar";
import { CostEstimatorInputs } from "@/client/features/compare/pricing";

// ---- client/features/rankings/aaColumns.tsx ----
function ReasoningBadge({ label }: { label: string }) {
  return <Lightbulb className="size-3.5 shrink-0 text-text-tertiary" aria-label={label} />;
}

function CompareButton({
  model,
  isCompared,
  onToggle,
}: {
  model: ArtificialAnalysisModel;
  isCompared: boolean;
  onToggle: (m: ArtificialAnalysisModel) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isCompared ? t("removeFromCompare") : t("addToCompare")}
      aria-pressed={isCompared}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(model);
      }}
      className="shrink-0 -my-2"
    >
      {isCompared ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
    </Button>
  );
}

/** Expanded row body showing the full model detail card. */
export function ModelExpandedDetail({ model }: { model: ArtificialAnalysisModel }) {
  return (
    <div className="p-4 sm:p-5">
      <ModelDetailContent model={model} showBenchmarks={false} />
    </div>
  );
}

function ReasoningPrefix({ model }: { model: ArtificialAnalysisModel }) {
  const { t } = useTranslation();
  return model.is_reasoning === true ? <ReasoningBadge label={t("reasoning")} /> : null;
}

function RankingModelCell({
  model,
  compareSet,
  onToggleCompare,
}: {
  model: ArtificialAnalysisModel;
  compareSet: Set<string>;
  onToggleCompare: (m: ArtificialAnalysisModel) => void;
}) {
  return (
    <RankingNameCell
      name={model.name}
      prefix={<ReasoningPrefix model={model} />}
      suffix={<CompareButton model={model} isCompared={compareSet.has(modelId(model))} onToggle={onToggleCompare} />}
    />
  );
}

interface PricedModel {
  model: ArtificialAnalysisModel;
  monthlyCost: number | null;
}

function PricedModelCell({
  row,
  compareSet,
  onToggleCompare,
}: {
  row: PricedModel;
  compareSet: Set<string>;
  onToggleCompare: (m: ArtificialAnalysisModel) => void;
}) {
  return (
    <RankingNameCell
      name={row.model.name || row.model.slug}
      nameClassName="text-sm"
      gapClassName="gap-1"
      prefix={<ReasoningPrefix model={row.model} />}
      suffix={
        <CompareButton model={row.model} isCompared={compareSet.has(modelId(row.model))} onToggle={onToggleCompare} />
      }
    />
  );
}

function priceCell(get: (m: PricedModel) => number | null | undefined, t: TFunction) {
  return (m: PricedModel) => formatDollar(get(m), t);
}

function scoreColumn(
  id: string,
  header: string,
  accessor: (m: ArtificialAnalysisModel) => number | null | undefined,
  t: TFunction,
  opts?: { mobilePrimary?: boolean },
): DataTableColumn<ArtificialAnalysisModel> {
  return rightColNA(
    id,
    header,
    (model) => {
      const value = accessor(model);
      return value == null ? null : formatScore(t, value);
    },
    t("notAvailable"),
    opts,
  );
}

/** Ranking table columns – compareSet is computed once by the caller and passed to avoid per-cell store subscriptions. */
export function buildRankingColumns(
  t: TFunction,
  compareSet: Set<string>,
  onToggleCompare: (m: ArtificialAnalysisModel) => void,
): DataTableColumn<ArtificialAnalysisModel>[] {
  return [
    textCol(
      "model",
      t("model"),
      (model) => <RankingModelCell model={model} compareSet={compareSet} onToggleCompare={onToggleCompare} />,
      { width: "40%" },
    ),
    rightCol("creator", t("creator"), (model) => (
      <RightAlignedText>{model.model_creators?.name || t("notAvailable")}</RightAlignedText>
    )),
    { ...scoreColumn("intelligence", t("intelligenceIndex"), (m) => m.intelligence_index, t), mobilePrimary: true },
    scoreColumn("coding", t("coding"), (m) => m.coding_index, t),
    scoreColumn("agentic", t("agentic"), (m) => m.agentic_index, t),
    rightColNA(
      "context",
      t("contextWindow"),
      (model) => (model.context_window_tokens != null ? formatTokens(model.context_window_tokens, t) : null),
      t("notAvailable"),
    ),
  ];
}

/** Pricing table columns: cache/prompt/completion prices and estimated monthly cost. */
export function buildPricingColumns(
  t: TFunction,
  compareSet: Set<string>,
  onToggleCompare: (m: ArtificialAnalysisModel) => void,
  getOfficial?: OfficialGetter,
): DataTableColumn<PricedModel>[] {
  return [
    textCol(
      "model",
      t("model"),
      (row) => <PricedModelCell row={row} compareSet={compareSet} onToggleCompare={onToggleCompare} />,
      { width: "35%" },
    ),
    rightCol("provider", t("provider"), (row) => (
      <RightAlignedText>{row.model.model_creators?.name || t("notAvailable")}</RightAlignedText>
    )),
    rightCol(
      "cacheHitPrice",
      t("cacheHitPrice"),
      priceCell((m) => resolveEffectivePricing(m.model.pricing, getOfficial?.(m.model)).cache_hit, t),
    ),
    rightCol(
      "blendedPrice",
      t("blendedPrice"),
      priceCell((m) => resolveBlendedPrice(m.model, getOfficial?.(m.model)), t),
    ),
    rightCol(
      "promptPrice",
      t("promptPrice"),
      priceCell((m) => resolveEffectivePricing(m.model.pricing, getOfficial?.(m.model)).input, t),
    ),
    rightCol(
      "completionPrice",
      t("completionPrice"),
      priceCell((m) => resolveEffectivePricing(m.model.pricing, getOfficial?.(m.model)).output, t),
    ),
    { ...mobilePrimaryCol("monthlyCost", t("monthlyCost"), (row) => formatDollar(row.monthlyCost, t)), hiddenMd: true },
  ];
}

// ---- client/features/rankings/ArtificialAnalysisView.tsx ----
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

  const officialQ = qOfficialPricing.use();
  const getOfficial = useMemo(() => {
    if (!officialQ.data) return undefined;
    const index = indexOfficialPricing(officialQ.data.models);
    return (m: ArtificialAnalysisModel) => matchOfficialPricing(index, m);
  }, [officialQ.data]);
  const { monthlyCosts, ...costInputs } = useMonthlyCosts(rankings, getOfficial);
  const comparedModels = useCompareModels(rankings);

  const avgCost = useMemo(() => {
    const valid = monthlyCosts.filter((v): v is number => v != null);
    return valid.length > 0 ? valid.reduce((a, b) => a + b, 0) / valid.length : 0;
  }, [monthlyCosts]);

  const compareIds = useCompareStore((s) => s.compareIds);
  const compareSet = useMemo(() => new Set(compareIds), [compareIds]);
  // Server returns rankings pre-sorted by intelligence index, so the display
  // order is the global rank; the map keeps ranks stable after search filtering.
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
        leading={
          viewMode === "pricing" ? <p className="text-xs text-text-tertiary">{t("pricingDisclaimer")}</p> : undefined
        }
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
