"use client";
import { memo } from "react";
import { formatDollar } from "@/client/utils/format";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { useTranslation } from "@/client/providers";
import type { CompareRow } from "@/client/features/compare/logic";
import { CompareTable, WinnerValue } from "@/client/features/compare/CompareTable";

function PriceValue({
  row,
  model,
  winner,
}: {
  row: CompareRow<ArtificialAnalysisModel>;
  model: ArtificialAnalysisModel;
  winner: "win" | "loss" | null;
}) {
  const { t } = useTranslation();
  const value = row.getNumeric?.(model);
  return typeof value === "number" ? (
    <WinnerValue value={formatDollar(value, t)} winner={winner} />
  ) : (
    <span className="text-text-tertiary">{t("notAvailable")}</span>
  );
}

export const PriceTable = memo(function PriceTable({
  priceRows,
  models,
}: {
  priceRows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
}) {
  return (
    <CompareTable
      rows={priceRows}
      models={models}
      mobileLayout="model-cards"
      renderValue={(row, model, winner) => <PriceValue row={row} model={model} winner={winner} />}
    />
  );
});
