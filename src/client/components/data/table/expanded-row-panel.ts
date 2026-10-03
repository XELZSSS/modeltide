import { h, type FunctionalComponent } from "vue";
import { cn } from "@/client/utils/cn";

const panelId = (rowId: string): string => `${rowId}-panel`;

export const ExpandedRowPanel: FunctionalComponent<{ rowId: string; rowName: string; class?: string }> = (
  props,
  { slots },
) =>
  h(
    "div",
    {
      id: panelId(props.rowId),
      role: "region",
      "aria-label": props.rowName,
      class: cn("animate-enter px-4 py-3", props.class),
    },
    slots.default?.(),
  );
