import { h } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar, orNA } from "@/shared/utils";
import {
  mobilePrimaryCol,
  rightCol,
  RightAlignedText,
  type DataTableColumn,
  type NameCellExtras,
} from "@/client/components/table/table-columns.ts";
import { modelCol } from "./aa-column-shared";
import type { CostEstimate } from "@/shared/utils/cost";
import { modelId } from "@/shared/utils/models";
import { resolveEffectivePricing, PRICE_LEGS, type EffectivePricing, type PriceLegPick } from "@/shared/utils/pricing";

export interface PricingRow {
  model: ArtificialAnalysisModel;
  /** The same object the monthly and blended columns read, so the two figures cannot diverge. */
  estimate: CostEstimate | null;
}

export function buildPricingColumns(
  t: TFunction,
  effectiveMap: Map<string, EffectivePricing>,
  extras?: NameCellExtras<ArtificialAnalysisModel>,
): DataTableColumn<PricingRow>[] {
  const getEff = (model: ArtificialAnalysisModel): EffectivePricing =>
    effectiveMap.get(modelId(model)) ?? resolveEffectivePricing(model.pricing);
  const pricingLegCol = (id: string, header: string, getLeg: PriceLegPick) =>
    rightCol(id, header, (row: PricingRow) => formatDollar(getLeg(getEff(row.model)), t));

  const modelNameColumn = modelCol<PricingRow, ArtificialAnalysisModel>(t, extras, "35%", (row) => row.model);
  return [
    modelNameColumn,
    rightCol("provider", t("provider"), (row) =>
      h(RightAlignedText, null, () => orNA(row.model.model_creators?.name, t)),
    ),
    pricingLegCol("promptPrice", t("promptPrice"), PRICE_LEGS.promptPrice),
    pricingLegCol("completionPrice", t("completionPrice"), PRICE_LEGS.completionPrice),
    pricingLegCol("cacheHitPrice", t("cacheHitPrice"), PRICE_LEGS.cacheHitPrice),
    pricingLegCol("cacheWritePrice", t("cacheWritePrice"), PRICE_LEGS.cacheWritePrice),
    rightCol("blendedPrice", t("blendedPrice"), (row: PricingRow) =>
      formatDollar(row.estimate?.blendedPrice ?? null, t),
    ),
    mobilePrimaryCol("monthlyCost", t("monthlyCost"), (row) => formatDollar(row.estimate?.monthlyCost ?? null, t), {
      hiddenMd: true,
    }),
  ];
}
