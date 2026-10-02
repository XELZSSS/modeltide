import type { VNodeChild } from "vue";
import type { RowListProps } from "./table-columns.vue";

export type RowListEmits = { toggleExpand: [rowId: string | null] };

export function useRowList<T>(props: RowListProps<T>): {
  renderExpanded: (row: T) => VNodeChild;
  rowName: (row: T) => string;
  isRowExpanded: (row: T) => boolean;
} {
  const renderExpanded = (row: T): VNodeChild => props.renderExpandedRow?.(row);
  const rowName = (row: T): string => props.getRowName?.(row) ?? props.getRowId(row);
  const isRowExpanded = (row: T): boolean => props.expandedRowId === props.getRowId(row);
  return { renderExpanded, rowName, isRowExpanded };
}

export function CellView<T>(cellProps: { render: (row: T) => VNodeChild; row: T }): VNodeChild {
  return cellProps.render(cellProps.row);
}
