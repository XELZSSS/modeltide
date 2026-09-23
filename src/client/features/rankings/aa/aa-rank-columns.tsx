import type { TFunction } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { formatScore } from "@/client/utils/format";
import {
  RightAlignedText,
  col,
  mobilePrimaryCol,
  rightCol,
  type DataTableColumn,
} from "@/client/components/data/table/table-columns";
import { CompareModelCell } from "@/client/features/rankings/aa/aa-cells";

function scoreColumn(
  id: string,
  header: string,
  accessor: (m: ArtificialAnalysisModel) => number | null | undefined,
  t: TFunction,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<ArtificialAnalysisModel> {
  const colFactory = opts?.mobilePrimary ? mobilePrimaryCol : rightCol;
  return colFactory(
    id,
    header,
    (model) => {
      const value = accessor(model);
      return (
        <RightAlignedText className={value == null ? "text-text-tertiary" : undefined}>
          {value == null ? t("notAvailable") : formatScore(value, t)}
        </RightAlignedText>
      );
    },
    opts?.hiddenMd ? { hiddenMd: true } : undefined,
  );
}

export function buildRankingColumns(
  t: TFunction,
  compareSet: Set<string>,
  onToggleCompare: (m: ArtificialAnalysisModel) => void,
): DataTableColumn<ArtificialAnalysisModel>[] {
  return [
    col(
      "model",
      t("model"),
      (model) => <CompareModelCell model={model} compareSet={compareSet} onToggleCompare={onToggleCompare} />,
      { width: "40%" },
    ),
    rightCol("creator", t("creator"), (model) => (
      <RightAlignedText>{model.model_creators?.name || t("notAvailable")}</RightAlignedText>
    )),
    scoreColumn("intelligence", t("intelligenceIndex"), (m) => m.intelligence_index, t, { mobilePrimary: true }),
    scoreColumn("coding", t("coding"), (m) => m.coding_index, t),
    scoreColumn("agentic", t("agentic"), (m) => m.agentic_index, t, { hiddenMd: true }),
  ];
}
