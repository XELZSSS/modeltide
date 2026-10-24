/**
 * Turns the paged rows into what the two table bodies render: a stable id, the name an expander announces, and whether
 * this row is the expanded one. Ids fall back to the row index so a payload without ids still keys correctly.
 */
import { computed, type ComputedRef, type VNodeChild } from "vue";
import type { RowListProps } from "./table-columns";

interface RowListItem<T> {
  row: T;
  id: string;
  name: string;
  expanded: boolean;
}

export function rowKeyOf<T extends object>(getRowId: (row: T) => string, row: T, index: number): string {
  return getRowId(row) || `row-${index}`;
}

export function useRowList<T extends object>(
  props: RowListProps<T>,
): { rows: ComputedRef<RowListItem<T>[]>; renderExpanded: (row: T) => VNodeChild } {
  const rows = computed<RowListItem<T>[]>(() =>
    props.pagedData.map((row, index) => {
      const id = rowKeyOf(props.getRowId, row, index);
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
