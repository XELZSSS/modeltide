import type { VNodeChild } from "vue";

export type RowListEmits = { toggleExpand: [rowId: string | null] };

export function CellView<T>(cellProps: { render: (row: T) => VNodeChild; row: T }): VNodeChild {
  return cellProps.render(cellProps.row);
}
