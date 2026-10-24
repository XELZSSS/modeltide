import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import type { NameCellExtras } from "@/client/components/table/table-columns.ts";
import { modelDetailHref, rankMapOf } from "@/shared/utils/models";
import type { ModelSource } from "@/shared/types";

/**
 * The name cell's rank and detail link, which all four ranking views build the same way: every list arrives in the
 * order its source ranks it in, so a row's position in that array is its rank, and the name opens the same detail page
 * the search box opens. It lives here instead of four times in the views so that a change to what a rank or a link
 * means reaches all four at once — the four copies had already drifted on nothing but their id accessor, which is why
 * that one is the parameter.
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
