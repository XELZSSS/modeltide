"use client";
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
import { computeBlendPrice } from "@/shared/utils";
import { resolveEffectivePricing, type OfficialGetter } from "@/client/utils/pricing-merge";
import { CompareModelCell } from "@/client/features/rankings/aa/cells";
import type { EffectivePricing } from "@/client/utils/pricing-merge";

export interface PricingRow {
  model: ArtificialAnalysisModel;
  monthlyCost: number | null;
}

export function buildPricingColumns(
  t: TFunction,
  compareSet: Set<string>,
  onToggleCompare: (m: ArtificialAnalysisModel) => void,
  effectiveMap?: Map<string, EffectivePricing>,
  getOfficial?: OfficialGetter,
  opts?: { pending?: boolean },
): DataTableColumn<PricingRow>[] {
  const pending = opts?.pending === true;
  const pendingBar = (width: string) => (
    <span className="ui-skeleton inline-block h-4 rounded-none align-middle" style={{ width }} aria-hidden="true" />
  );
  const getEff = (model: ArtificialAnalysisModel): EffectivePricing =>
    effectiveMap?.get(model.id) ?? resolveEffectivePricing(model.pricing, getOfficial?.(model));
  const pricingLegCol = (
    id: string,
    header: string,
    getLeg: (eff: EffectivePricing) => number | null | undefined,
    opts?: { hiddenMd?: boolean },
  ) =>
    rightCol(
      id,
      header,
      (row: PricingRow) => (pending ? pendingBar("4rem") : formatDollar(getLeg(getEff(row.model)), t)),
      opts,
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
    pricingLegCol("cacheHitPrice", t("cacheHitPrice"), (eff) => eff.cacheHit, { hiddenMd: true }),
    rightCol("blendedPrice", t("blendedPrice"), (row: PricingRow) =>
      pending ? pendingBar("4.5rem") : formatDollar(computeBlendPrice(getEff(row.model)), t),
    ),
    pricingLegCol("promptPrice", t("promptPrice"), (eff) => eff.input, { hiddenMd: true }),
    pricingLegCol("completionPrice", t("completionPrice"), (eff) => eff.output, { hiddenMd: true }),
    {
      ...mobilePrimaryCol("monthlyCost", t("monthlyCost"), (row) =>
        pending ? pendingBar("5rem") : formatDollar(row.monthlyCost, t),
      ),
      hiddenMd: true,
    },
  ];
}
