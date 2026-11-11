import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { DataTableColumn, NameCellExtras } from "@/client/components/table/table-columns.ts";
import type { TFunction } from "@/shared/i18n";
import { modelDetailHref, rankMapOf } from "@/shared/utils/models";
import type { ModelSource } from "@/shared/types";

/**
 * The name cell's rank and detail link, which all four ranking views build the same way: every list arrives in the order
 * its source ranks it in, so a row's position in that array is its rank. `rows` is a getter rather than an array so the
 * map is rebuilt only when the payload changes, not on every render.
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

/** The pair every ranking view writes — build the extras from the delivered order, then hand them to the view's column
 * builder — as one call, so a view cannot ship a table whose name column lost its rank or its detail link. */
export function useRankedColumns<T>(
  rows: MaybeRefOrGetter<readonly T[]>,
  idOf: (row: T) => string,
  source: ModelSource,
  build: (t: TFunction, extras: NameCellExtras<T>) => DataTableColumn<T>[],
): (t: TFunction) => DataTableColumn<T>[] {
  const extras = useRankExtras(rows, idOf, source);
  return (t) => build(t, extras.value);
}
