"use client";
import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatScore } from "@/client/utils/format";
import {
  RightAlignedText,
  rightCol,
  rightColNA,
  textCol,
  type DataTableColumn,
} from "@/client/components/data/columns";
import { CompareModelCell } from "@/client/features/rankings/aa/cells";

function scoreColumn(
  id: string,
  header: string,
  accessor: (m: ArtificialAnalysisModel) => number | null | undefined,
  t: TFunction,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<ArtificialAnalysisModel> {
  return rightColNA(
    id,
    header,
    (model) => {
      const value = accessor(model);
      return value == null ? null : formatScore(t, value);
    },
    t("notAvailable"),
    opts,
  );
}

export function buildRankingColumns(
  t: TFunction,
  compareSet: Set<string>,
  onToggleCompare: (m: ArtificialAnalysisModel) => void,
): DataTableColumn<ArtificialAnalysisModel>[] {
  return [
    textCol(
      "model",
      t("model"),
      (model) => <CompareModelCell model={model} compareSet={compareSet} onToggleCompare={onToggleCompare} />,
      { width: "40%" },
    ),
    rightCol("creator", t("creator"), (model) => (
      <RightAlignedText>{model.model_creators?.name || t("notAvailable")}</RightAlignedText>
    )),
    { ...scoreColumn("intelligence", t("intelligenceIndex"), (m) => m.intelligence_index, t), mobilePrimary: true },
    scoreColumn("coding", t("coding"), (m) => m.coding_index, t),
    scoreColumn("agentic", t("agentic"), (m) => m.agentic_index, t, { hiddenMd: true }),
  ];
}
