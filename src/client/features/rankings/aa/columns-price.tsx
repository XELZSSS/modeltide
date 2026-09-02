import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatDollar } from "@/client/utils/format";
import {
  RightAlignedText,
  mobilePrimaryCol,
  rightCol,
  textCol,
  type DataTableColumn,
} from "@/client/components/data/columns";
import { resolveBlendedPrice, resolveEffectivePricing, type OfficialGetter } from "@/client/utils/pricing-merge";
import { CompareModelCell } from "@/client/features/rankings/aa/cells";

export interface PricingRow {
  model: ArtificialAnalysisModel;
  monthlyCost: number | null;
}

function priceCell(get: (m: PricingRow) => number | null | undefined, t: TFunction) {
  return (m: PricingRow) => formatDollar(get(m), t);
}

export function buildPricingColumns(
  t: TFunction,
  compareSet: Set<string>,
  onToggleCompare: (m: ArtificialAnalysisModel) => void,
  getOfficial?: OfficialGetter,
): DataTableColumn<PricingRow>[] {
  const pricingLegCol = (
    id: string,
    header: string,
    getLeg: (eff: ReturnType<typeof resolveEffectivePricing>) => number | null | undefined,
  ) =>
    rightCol(id, header, (row: PricingRow) =>
      formatDollar(getLeg(resolveEffectivePricing(row.model.pricing, getOfficial?.(row.model))), t),
    );
  return [
    textCol(
      "model",
      t("model"),
      (row) => <CompareModelCell model={row.model} compareSet={compareSet} onToggleCompare={onToggleCompare} />,
      { width: "35%" },
    ),
    rightCol("provider", t("provider"), (row) => (
      <RightAlignedText>{row.model.model_creators?.name || t("notAvailable")}</RightAlignedText>
    )),
    pricingLegCol("cacheHitPrice", t("cacheHitPrice"), (eff) => eff.cacheHit),
    rightCol(
      "blendedPrice",
      t("blendedPrice"),
      priceCell((m) => resolveBlendedPrice(m.model, getOfficial?.(m.model)), t),
    ),
    pricingLegCol("promptPrice", t("promptPrice"), (eff) => eff.input),
    pricingLegCol("completionPrice", t("completionPrice"), (eff) => eff.output),
    { ...mobilePrimaryCol("monthlyCost", t("monthlyCost"), (row) => formatDollar(row.monthlyCost, t)), hiddenMd: true },
  ];
}
