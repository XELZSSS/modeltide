import { h } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { DataTableColumn, NameCellExtras } from "@/client/components/table/table-columns.ts";
import CompareModelCell from "./compare-model-cell.vue";

/**
 * The model column both AA tables open with: the name cell, its rank in the delivered ranking, the compare toggle and the
 * link to the detail page. Only the width differs — the pricing table gives the four price legs more room — so the cell
 * itself lives here rather than in two hand-copied `h(CompareModelCell, ...)` blocks.
 *
 * `modelOf` is explicit because the pricing table's row is a model plus its estimate: reading `row.model` there and
 * `row` in the ranking table is the one thing the two tables cannot share.
 */
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
