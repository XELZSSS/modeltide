import type { CompareRow } from "../logic";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { TFunction } from "@/shared/i18n";

/** Price comparison rows for prompt/completion/cache-hit rates; lower is always better. */
export function buildPriceRows(t: TFunction): CompareRow<ArtificialAnalysisModel>[] {
  return [
    { label: t("promptPrice"), getNumeric: (m) => m.pricing?.input, bestIs: "min" },
    { label: t("completionPrice"), getNumeric: (m) => m.pricing?.output, bestIs: "min" },
    { label: t("cacheHitPrice"), getNumeric: (m) => m.pricing?.cache_hit, bestIs: "min" },
  ];
}
