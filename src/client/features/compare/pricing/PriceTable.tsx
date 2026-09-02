import { memo } from "react";
import { TrendingUp } from "lucide-react";
import { cn, formatDollar } from "@/client/utils";
import { getModelColor } from "@/client/utils/charts";
import { CompareTable } from "@/client/features/compare/CompareTable";
import type { CompareRow } from "../logic";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";

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
      {formatDollar(value)}
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
  return (
    <CompareTable
      rows={priceRows}
      models={models}
      getKey={(m) => m.id || m.slug}
      getName={(m) => m.short_name || m.name}
      getColor={getModelColor}
      mobileLayout="model-cards"
      renderValue={(row, model, winner) => <PriceValue row={row} model={model} winner={winner} />}
    />
  );
});
