import { h, type VNodeChild } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatScore, orNA } from "@/shared/utils";
import {
  rightAlignedCol,
  rightCol,
  RightAlignedText,
  type DataTableColumn,
  type NameCellExtras,
} from "@/client/components/table/table-columns.ts";
import { modelCol } from "./aa-column-shared";

function scoreColumn(
  id: string,
  header: string,
  accessor: (m: ArtificialAnalysisModel) => number | null | undefined,
  t: TFunction,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<ArtificialAnalysisModel> {
  const cell = (model: ArtificialAnalysisModel): VNodeChild => {
    const value = accessor(model);
    return h(RightAlignedText, { class: value == null ? "text-text-tertiary" : undefined }, () =>
      formatScore(value, t),
    );
  };
  return rightAlignedCol(id, header, cell, { mobilePrimary: opts?.mobilePrimary, hiddenMd: opts?.hiddenMd });
}

export function buildRankingColumns(
  t: TFunction,
  extras?: NameCellExtras<ArtificialAnalysisModel>,
): DataTableColumn<ArtificialAnalysisModel>[] {
  return [
    modelCol(t, extras, "40%", (row) => row),
    rightCol("creator", t("creator"), (model) => h(RightAlignedText, null, () => orNA(model.model_creators?.name, t))),
    scoreColumn("intelligence", t("intelligenceIndex"), (m) => m.intelligence_index, t, { mobilePrimary: true }),
    scoreColumn("coding", t("coding"), (m) => m.coding_index, t),
    scoreColumn("agentic", t("agentic"), (m) => m.agentic_index, t),
  ];
}
