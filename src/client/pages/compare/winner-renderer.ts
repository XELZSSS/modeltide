import { h, type VNodeChild } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import type { CompareRow, Winner } from "@/client/utils/compare-logic";
import { WinnerValue } from "./winner-marks.ts";

/**
 * The cell renderer both comparison pages hand to `CompareTable`: they differ only in how a number is formatted, so the
 * "no value" branch — a tertiary blank, never a 0, because the two mean different things — lives here once. `t` is
 * passed in rather than taken from a setup scope, because this module has none: the page reads it at render, so a
 * language switch still repaints the cell.
 */
export function makeWinnerRenderer(
  t: TFunction,
  format: (value: number) => string,
): (row: CompareRow<ArtificialAnalysisModel>, model: ArtificialAnalysisModel, winner: Winner | null) => VNodeChild {
  return (row, model, winner) => {
    const value = row.getNumeric(model);
    return typeof value === "number"
      ? h(WinnerValue, { value: format(value), winner })
      : h("span", { class: "text-text-tertiary" }, t("notAvailable"));
  };
}
