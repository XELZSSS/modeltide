import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { DataTableColumn, NameCellExtras } from "@/client/components/table/table-columns.ts";
import type { TFunction } from "@/shared/i18n";
import { modelDetailHref, rankMapOf } from "@/shared/utils/models";
import type { ModelSource } from "@/shared/types";

/**
 * The name cell's rank and detail link, which all four ranking views build the same way: every list arrives in the
 * order its source ranks it in, so a row's position in that array is its rank, and the name opens the same detail page
 * the model search and the expanded row lead to. It lives here instead of four times in the views so that a change to
 * what a rank or a link means reaches all four at once — the four copies had already drifted on nothing but their id
 * accessor, which is why that one is the parameter.
 *
 * `rows` is a getter rather than an array so the map is rebuilt only when the payload changes, not on every render.
 */
export function useRankExtras<T>(
  rows: MaybeRefOrGetter<readonly T[]>,
  idOf: (row: T) => string,
  source: ModelSource,
): ComputedRef<NameCellExtras<T>> {
  return computed<NameCellExtras<T>>(() => {
    const ranks = rankMapOf(toValue(rows), idOf);
    return {
      rankOf: (row) => ranks.get(idOf(row)) ?? null,
      hrefOf: (row) => modelDetailHref(source, idOf(row)),
    };
  });
}

/**
 * The pair every ranking view writes — build the extras from the delivered order, then hand them to the view's column
 * builder — as one call, so a view cannot ship a table whose name column lost its rank or its detail link by forgetting
 * the second half. `RankedTableView` takes the result directly: it calls the builder with its own translator on every
 * render, which is what keeps the column labels switching language with the rest of the page.
 */
export function useRankedColumns<T>(
  rows: MaybeRefOrGetter<readonly T[]>,
  idOf: (row: T) => string,
  source: ModelSource,
  build: (t: TFunction, extras: NameCellExtras<T>) => DataTableColumn<T>[],
): (t: TFunction) => DataTableColumn<T>[] {
  const extras = useRankExtras(rows, idOf, source);
  return (t) => build(t, extras.value);
}
