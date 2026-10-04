import type { VNodeChild } from "vue";

export type RowListEmits = { toggleExpand: [rowId: string | null] };

export function RenderView(cellProps: { render: () => VNodeChild }): VNodeChild {
  return cellProps.render();
}

export function CellView<T>(cellProps: { render: (row: T) => VNodeChild; row: T }): VNodeChild {
  return RenderView({ render: () => cellProps.render(cellProps.row) });
}
