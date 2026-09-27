import { h, type VNodeChild } from "vue";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatScore, orNA } from "@/client/utils/format";
import {
  col,
  mobilePrimaryCol,
  rightCol,
  RightAlignedText,
  type DataTableColumn,
} from "@/client/components/data/table/table-columns.vue";
import CompareModelCell from "./compare-model-cell.vue";

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
  const alignOpts = opts?.hiddenMd ? { hiddenMd: true } : undefined;
  return opts?.mobilePrimary ? mobilePrimaryCol(id, header, cell, alignOpts) : rightCol(id, header, cell, alignOpts);
}

export function buildRankingColumns(t: TFunction): DataTableColumn<ArtificialAnalysisModel>[] {
  return [
    col("model", t("model"), (model) => h(CompareModelCell, { model }), { width: "40%" }),
    rightCol("creator", t("creator"), (model) => h(RightAlignedText, null, () => orNA(model.model_creators?.name, t))),
    scoreColumn("intelligence", t("intelligenceIndex"), (m) => m.intelligence_index, t, { mobilePrimary: true }),
    scoreColumn("coding", t("coding"), (m) => m.coding_index, t),
    scoreColumn("agentic", t("agentic"), (m) => m.agentic_index, t, { hiddenMd: true }),
  ];
}
