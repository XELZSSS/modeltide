/**
 * The expanded row's container, shared by the desktop table (a full-width `<tr>`) and the mobile card list. It is one
 * labelled region with a derivable id, so the expander's `aria-controls` can point at it.
 */
import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";
import { ROW_PADDING } from "@/client/nav/layout";

export const rowPanelId = (rowId: string): string => `${rowId}-panel`;

export const ExpandedRowPanel: FunctionalComponent<{ rowId: string; rowName: string; class?: string }> = (
  props,
  { slots },
) =>
  h(
    "div",
    {
      id: rowPanelId(props.rowId),
      role: "region",
      "aria-label": props.rowName,
      class: cn(ROW_PADDING, props.class),
    },
    slots.default?.(),
  );
