import type { VNodeChild } from "vue";

/**
 * The two ways a table cell is rendered from a template, kept together because they are the same idea with a different
 * arity.
 */

/** Renders a `VNodeChild` thunk: `<RenderView :render="() => …" />`. Used where the caller closes over the row itself. */
export function RenderView(viewProps: { render: () => VNodeChild }): VNodeChild {
  return viewProps.render();
}

/**
 * Renders one column's cell for one row: `<CellView :render="col.cell" :row="row" />`. A column carries its own
 * `cell(row)` renderer (see `col()` in table-columns.ts), so the table views only need to call it.
 */
export function CellView<T>(cellProps: { render: (row: T) => VNodeChild; row: T }): VNodeChild {
  return cellProps.render(cellProps.row);
}
