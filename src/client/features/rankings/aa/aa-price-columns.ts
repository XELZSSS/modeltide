import { h } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar, orNA } from "@/client/utils/format";
import {
  col,
  mobilePrimaryCol,
  rightCol,
  RightAlignedText,
  type DataTableColumn,
} from "@/client/components/data/table/table-columns.vue";
import CompareModelCell from "./compare-model-cell.vue";
import { computeBlendPrice } from "@/shared/utils";
import { modelId } from "@/client/utils/model-utils";
import { resolveEffectivePricing, PRICE_LEGS, type EffectivePricing, type PriceLegPick } from "@/client/utils/pricing";

export interface PricingRow {
  model: ArtificialAnalysisModel;
  monthlyCost: number | null;
}

export function buildPricingColumns(
  t: TFunction,
  effectiveMap: Map<string, EffectivePricing>,
): DataTableColumn<PricingRow>[] {
  const getEff = (model: ArtificialAnalysisModel): EffectivePricing =>
    effectiveMap.get(modelId(model)) ?? resolveEffectivePricing(model.pricing);
  const pricingLegCol = (id: string, header: string, getLeg: PriceLegPick) =>
    rightCol(id, header, (row: PricingRow) => formatDollar(getLeg(getEff(row.model)), t), { hiddenMd: true });
  return [
    col("model", t("model"), (row) => h(CompareModelCell, { model: row.model }), { width: "35%" }),
    rightCol("provider", t("provider"), (row) =>
      h(RightAlignedText, null, () => orNA(row.model.model_creators?.name, t)),
    ),
    pricingLegCol("cacheHitPrice", t("cacheHitPrice"), PRICE_LEGS.cacheHitPrice),
    rightCol("blendedPrice", t("blendedPrice"), (row: PricingRow) =>
      formatDollar(computeBlendPrice(getEff(row.model)), t),
    ),
    pricingLegCol("promptPrice", t("promptPrice"), PRICE_LEGS.promptPrice),
    pricingLegCol("completionPrice", t("completionPrice"), PRICE_LEGS.completionPrice),
    mobilePrimaryCol("monthlyCost", t("monthlyCost"), (row) => formatDollar(row.monthlyCost, t), { hiddenMd: true }),
  ];
}
