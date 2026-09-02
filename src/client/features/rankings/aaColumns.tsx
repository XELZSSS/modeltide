import { Lightbulb, Plus, Check } from "lucide-react";
import {
  RightAlignedText,
  RankingNameCell,
  textCol,
  rightCol,
  rightColNA,
  mobilePrimaryCol,
  type DataTableColumn,
} from "@/client/components/data";
import { Button } from "@/client/components/ui";
import { ModelDetailContent } from "@/client/features/models/ModelDetailContent";
import { formatScore, formatDollar, formatTokens, modelId } from "@/client/utils";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";
import { useTranslation } from "@/client/providers";

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
      priceCell((m) => m.model.pricing?.cache_hit, t),
    ),
    rightCol(
      "blendedPrice",
      t("blendedPrice"),
      priceCell((m) => m.model.blended_price, t),
    ),
    rightCol(
      "promptPrice",
      t("promptPrice"),
      priceCell((m) => m.model.pricing?.input, t),
    ),
    rightCol(
      "completionPrice",
      t("completionPrice"),
      priceCell((m) => m.model.pricing?.output, t),
    ),
    { ...mobilePrimaryCol("monthlyCost", t("monthlyCost"), (row) => formatDollar(row.monthlyCost, t)), hiddenMd: true },
  ];
}
