import { h, type FunctionalComponent } from "vue";
import { TrendingDown, TrendingUp } from "@lucide/vue";
import { cn } from "@/client/utils/cn";
import type { Winner } from "@/client/utils/compare-logic";

/**
 * The two cell renderers the comparison pages share: a win mark and a value tinted by its verdict.
 *
 * They live here rather than inside `compare-table.vue` because three callers need them — the table, the cost estimator
 * and the cell renderer the pages pass in — and exporting them from the table made a leaf component import a page
 * component. Nothing here reads a setup scope, so any of those callers can use it.
 */
export const WinnerMark: FunctionalComponent = () =>
  h(TrendingUp, { size: 12, class: "inline ml-0.5 text-success", "aria-hidden": "true" });

export const WinnerValue: FunctionalComponent<{ value: string; winner: Winner | null }> = (props) =>
  h(
    "span",
    {
      class: cn(
        "font-mono tabular-nums",
        props.winner === "win" && "font-semibold text-success",
        props.winner === "loss" && "text-destructive",
      ),
    },
    [
      props.value,
      props.winner === "win" ? h(WinnerMark) : null,
      props.winner === "loss"
        ? h(TrendingDown, { size: 12, class: "inline ml-0.5 text-destructive", "aria-hidden": "true" })
        : null,
    ],
  );
