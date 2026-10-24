import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";
import { cellClasses, cellInnerClasses, type HeaderColumn } from "./cell-classes.ts";

/**
 * The `<thead>` of a data table: a functional component rather than an SFC because it renders a single `<tr>` of `<th>`s
 * with no state. The leading 7px spacer appears only when the body has row expanders, so the header labels line up with
 * the cell text and not with the chevron.
 */
export const TableHeader: FunctionalComponent<{ columns: HeaderColumn[]; isExpandable: boolean }> = (props) =>
  h(
    "thead",
    h(
      "tr",
      { class: "border-b border-border" },
      props.columns.map((col, colIdx) =>
        h(
          "th",
          {
            key: col.id,
            scope: "col",
            class: cn(cellClasses(col), "ui-table-header"),
            style: { width: col.width },
          },
          h("div", { class: cellInnerClasses(col) }, [
            props.isExpandable && colIdx === 0 ? h("span", { class: "w-7 shrink-0", "aria-hidden": "true" }) : null,
            col.header ? h("span", { class: "truncate", title: col.header }, col.header) : null,
          ]),
        ),
      ),
    ),
  );
