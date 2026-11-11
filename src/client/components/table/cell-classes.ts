import { cn } from "@/client/utils/cn";
import { ROW_PADDING } from "@/client/nav/layout";
import type { DataTableColumn } from "./table-columns.ts";

/** Class helpers for the two halves of a data table. Header and body must agree on both, or a column breaks in one of the
 * two views: `hiddenMd` has to hide the `th` *and* the `td`, and the alignment wrapper pushes a right-aligned column's
 * content to the end. They live in one module for that reason. */

/** The layout half of a column: everything a header cell needs, without the cell renderer. */
export type HeaderColumn = Pick<DataTableColumn<never>, "id" | "header" | "width" | "hiddenMd" | "align">;

/** A column object outlives every render of its table, while both helpers below run once per cell per render, so
 * memoising on the column keeps the `tailwind-merge` parses off the render path. */
const outerClassCache = new WeakMap<HeaderColumn, string>();
const innerClassCache = new WeakMap<HeaderColumn, string>();

export function cellClasses(col: HeaderColumn): string {
  const cached = outerClassCache.get(col);
  if (cached !== undefined) return cached;
  const value = cn(ROW_PADDING, col.hiddenMd && "hidden md:table-cell");
  outerClassCache.set(col, value);
  return value;
}

export function cellInnerClasses(col: HeaderColumn): string {
  const cached = innerClassCache.get(col);
  if (cached !== undefined) return cached;
  const value = cn("flex min-w-0 items-center gap-2 [&>*]:min-w-0", col.align === "right" && "justify-end text-right");
  innerClassCache.set(col, value);
  return value;
}
