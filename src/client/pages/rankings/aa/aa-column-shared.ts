import { h } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { DataTableColumn, NameCellExtras } from "@/client/components/table/table-columns.ts";
import CompareModelCell from "./compare-model-cell.vue";

/** The model column both AA tables open with: the name cell, its rank in the delivered ranking, the compare toggle and the
 * link to the detail page; only the width differs between the two tables. `modelOf` is explicit because the pricing
 * table's row is a model plus its estimate. */
export function modelCol<T, M extends ArtificialAnalysisModel>(
  t: TFunction,
  extras: NameCellExtras<M> | undefined,
  width: number | string,
  modelOf: (row: T) => M,
): DataTableColumn<T> {
  return {
    id: "model",
    header: t("model"),
    width,
    cell: (row) => {
      const model = modelOf(row);
      return h(CompareModelCell, {
        model,
        rank: extras?.rankOf?.(model) ?? null,
        href: extras?.hrefOf?.(model),
      });
    },
  };
}
