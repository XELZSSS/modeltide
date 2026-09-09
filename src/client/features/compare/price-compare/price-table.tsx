"use client";
import { memo } from "react";
import { TrendingUp } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { formatDollar } from "@/client/utils/format";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { useTranslation } from "@/client/providers";
import type { CompareRow } from "@/client/features/compare/logic";
import { CompareTable, modelKeyOf, modelNameOf, useModelColorOf } from "@/client/features/compare/CompareTable";

export const WinnerMark = memo(function WinnerMark() {
  return (
    <span className={cn("inline-flex items-center gap-0.5", "text-xs font-semibold", "text-success ml-1")}>
      <TrendingUp size={10} />
    </span>
  );
});

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
    <span className={cn("font-mono", winner === "win" && "font-semibold text-success")}>
      {formatDollar(value, t)}
      {winner === "win" && <WinnerMark />}
    </span>
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
  const getColor = useModelColorOf();
  return (
    <CompareTable
      rows={priceRows}
      models={models}
      getKey={modelKeyOf}
      getName={modelNameOf}
      getColor={getColor}
      mobileLayout="model-cards"
      renderValue={(row, model, winner) => <PriceValue row={row} model={model} winner={winner} />}
    />
  );
});
