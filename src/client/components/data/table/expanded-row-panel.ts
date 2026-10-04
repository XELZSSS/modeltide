import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";
import { ROW_PADDING } from "@/client/config/layout";

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
      class: cn("animate-enter", ROW_PADDING, props.class),
    },
    slots.default?.(),
  );
