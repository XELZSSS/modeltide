import { computed, type ComputedRef, type VNodeChild } from "vue";
import type { RowListProps } from "./table-columns";

export interface RowListItem<T> {
  row: T;
  id: string;
  name: string;
  expanded: boolean;
}

/**
 * Shared derivation for the desktop table body and the mobile card list:
 * ids, names and expansion state are computed once per row instead of
 * calling the accessors three to five times per row inside the template.
 */
export function useRowList<T extends object>(
  props: RowListProps<T>,
): { rows: ComputedRef<RowListItem<T>[]>; renderExpanded: (row: T) => VNodeChild } {
  const rows = computed<RowListItem<T>[]>(() =>
    props.pagedData.map((row) => {
      const id = props.getRowId(row);
      return {
        row,
        id,
        name: props.getRowName?.(row) ?? id,
        expanded: props.expandedRowId === id,
      };
    }),
  );
  const renderExpanded = (row: T): VNodeChild => props.renderExpandedRow?.(row);
  return { rows, renderExpanded };
}
