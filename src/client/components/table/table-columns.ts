/**
 * The data-table contract: what a column is, how to build one, and the props/emits the desktop and mobile bodies share.
 *
 * Views never declare these shapes themselves — `data-table.vue`, the two bodies and the pages building columns all
 * speak this one vocabulary, which is what keeps a column definition working in both layouts.
 */

import { h, type FunctionalComponent, type VNodeChild } from "vue";
import { cn } from "@/client/utils/cn";
import RankingNameCell from "./ranking-name-cell.vue";

export interface DataTableColumn<T> {
  id: string;
  header?: string;
  cell: (row: T) => VNodeChild;
  align?: "left" | "right";
  width?: number | string;
  /**
   * Leave this column out of the mobile card. Only for a value that the primary cell already renders on a phone —
   * every other column belongs in the card, because a hidden column is data the reader cannot reach at all.
   */
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
}

export interface RowAccessors<T> {
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
}

/**
 * The row decorations a ranking table adds to its model-name cell: the row's rank in the delivered ranking, and the link to
 * its detail page. Both are optional and both sit outside the column contract proper, because a table that is not a ranking
 * — or a row with no id to link to — simply omits them.
 */
export interface NameCellExtras<T> {
  rankOf?: (row: T) => number | null;
  hrefOf?: (row: T) => string | undefined;
}

export interface RowListProps<T> extends RowAccessors<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  isExpandable: boolean;
  expandedRowId?: string | null;
  renderExpandedRow?: (row: T) => VNodeChild;
}

/** What a table body emits: the row id to expand, or `null` when the open row is collapsed again. */
export type RowListEmits = { toggleExpand: [rowId: string | null] };

interface ColOpts {
  width?: number | string;
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
  align?: "left" | "right";
}

export function col<T>(id: string, header: string, cell: (row: T) => VNodeChild, opts?: ColOpts): DataTableColumn<T> {
  return { id, header, cell, ...opts };
}

export function trendClass(change: number | null | undefined): string {
  if (change == null || change === 0) return "text-text-tertiary";
  return change > 0 ? "text-success" : "text-destructive";
}

export function rightCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { hiddenMd?: boolean; width?: number | string },
): DataTableColumn<T> {
  return col(id, header, cell, { ...opts, align: "right" });
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return col(id, header, cell, { ...opts, align: "right", mobilePrimary: true });
}

const MONO_EMPHASIS_CLASS = {
  strong: "ui-mono-value font-semibold",
  muted: "ui-mono-value font-normal text-text-secondary",
} as const;

/**
 * A right-aligned column: the shape `rightCol` and `mobilePrimaryCol` both produce, with the choice between them kept in
 * one place. A value that is also the phone card's primary cell opts into `mobilePrimary`. No `width`: the primary cell
 * is sized by the mobile card layout, so width rides on `rightCol` directly.
 */
export function rightAlignedCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<T> {
  return opts?.mobilePrimary ? mobilePrimaryCol(id, header, cell, opts) : rightCol(id, header, cell, opts);
}

export function monoCol<T>(
  id: string,
  header: string,
  format: (row: T) => VNodeChild,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean; emphasis?: keyof typeof MONO_EMPHASIS_CLASS },
): DataTableColumn<T> {
  const className = opts?.emphasis ? MONO_EMPHASIS_CLASS[opts.emphasis] : "ui-mono-value";
  const cell = (row: T): VNodeChild => h("span", { class: className }, [format(row)]);
  return rightAlignedCol(id, header, cell, { mobilePrimary: opts?.mobilePrimary, hiddenMd: opts?.hiddenMd });
}

export const RightAlignedText: FunctionalComponent<{ class?: string }> = (props, { slots }) =>
  // Mobile cards stack the label above the value, so a column's alignment must not be baked into the cell: the desktop
  // table supplies `justify-end text-right` from `align: "right"`, and here the value wraps instead of truncating.
  h("p", { class: cn("min-w-0 break-words md:truncate", props.class) }, slots.default?.());

export function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => string,
  opts?: NameCellExtras<T> & { width?: number | string },
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width: opts?.width ?? "40%",
    cell: (row) => {
      const title = titleOf(row);
      const text = textOf(row);
      return h(RankingNameCell, {
        name: text,
        title,
        rank: opts?.rankOf?.(row) ?? null,
        href: opts?.hrefOf?.(row),
      });
    },
  };
}
