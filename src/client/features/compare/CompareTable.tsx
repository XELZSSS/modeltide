"use client";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useTranslation, useDevice } from "@/client/providers";
import { useChartTheme, seriesColor } from "@/client/theme/chart-theme";
import { Card, CardContent } from "@/client/components/ui/card";
import { CompareTd, CompareTh, CompareTr } from "@/client/components/data/columns";
import { Dot } from "@/client/components/ui/primitives";
import { cn } from "@/client/utils/cn";
import { modelId } from "@/client/utils/model";
import { computeWinners, rowKey, type CompareRow, type Winner } from "./logic";
import type { ArtificialAnalysisModel } from "@/shared/types";

const Th = CompareTh;
const Td = CompareTd;
const Tr = CompareTr;

interface CompareTableProps {
  rows: CompareRow<ArtificialAnalysisModel>[];
  models: ArtificialAnalysisModel[];
  renderValue: (
    row: CompareRow<ArtificialAnalysisModel>,
    model: ArtificialAnalysisModel,
    winner: Winner | null,
  ) => ReactNode;
  mobileLayout?: "metric-rows" | "model-cards";
}

interface TablePartsProps extends Omit<CompareTableProps, "mobileLayout"> {
  winners: Map<string, Map<string, Winner>>;
  getKey: (m: ArtificialAnalysisModel, index: number) => string;
  getName: (m: ArtificialAnalysisModel) => string;
  getColor: (index: number) => string;
}

const modelKeyOf = (m: ArtificialAnalysisModel, index: number) => modelId(m) || `idx-${index}`;
const modelNameOf = (m: ArtificialAnalysisModel) => m.short_name || m.name;

function useModelColorOf(): (index: number) => string {
  const theme = useChartTheme();
  return useCallback((index: number) => seriesColor(theme, index), [theme]);
}

export const WinnerMark = memo(function WinnerMark() {
  return <TrendingUp size={12} className="inline ml-0.5 text-success" aria-hidden="true" />;
});

/** Shared value cell: applies the win/loss styling and marks in one place. */
export const WinnerValue = memo(function WinnerValue({ value, winner }: { value: string; winner: Winner | null }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums",
        winner === "win" && "font-semibold text-success",
        winner === "loss" && "text-destructive",
      )}
    >
      {value}
      {winner === "win" && <WinnerMark />}
      {winner === "loss" && <TrendingDown size={12} className="inline ml-0.5 text-destructive" aria-hidden="true" />}
    </span>
  );
});

function DesktopTable({ rows, models, getKey, getName, getColor, renderValue, winners }: TablePartsProps) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent>
        <div className="min-w-0 w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th className="font-semibold text-text-secondary sticky left-0 z-10 bg-bg-card">{t("metric")}</Th>
                {models.map((model, index) => (
                  <Th
                    key={getKey(model, index)}
                    align="right"
                    className="font-semibold"
                    style={{ color: getColor(index) }}
                  >
                    {getName(model)}
                  </Th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <Tr key={rowKey(row)} className="hoverable:hover:bg-hover transition-colors">
                  <Th scope="row" className="text-text-secondary sticky left-0 bg-bg-card z-10">
                    {row.label}
                  </Th>
                  {models.map((model, index) => (
                    <Td key={getKey(model, index)} align="right">
                      {renderValue(row, model, getWinner(winners, row, model, index))}
                    </Td>
                  ))}
                </Tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function MobileTable({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  winners,
  layout,
}: TablePartsProps & { layout: "metric-rows" | "model-cards" }) {
  if (layout === "model-cards") {
    return (
      <div className="flex flex-col gap-3">
        {models.map((model, index) => (
          <Card key={getKey(model, index)}>
            <CardContent className="flex flex-col gap-3 sm:p-4">
              <p className="flex items-center gap-2 text-sm font-medium truncate" style={{ color: getColor(index) }}>
                <Dot size="sm" color={getColor(index)} />
                {getName(model)}
              </p>
              <div className="flex flex-col gap-2">
                {rows.map((row) => (
                  <div key={rowKey(row)} className="flex items-center justify-between gap-3">
                    <span className="ui-caption">{row.label}</span>
                    {renderValue(row, model, getWinner(winners, row, model, index))}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <Card>
      <CardContent className="sm:p-4">
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            return (
              <div key={rowKey(row)} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                <span className="text-xs font-medium text-text-secondary shrink-0">{row.label}</span>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {models.map((model, index) => (
                    <span key={getKey(model, index)} className="flex items-center gap-1">
                      <Dot size="sm" color={getColor(index)} />
                      {renderValue(row, model, getWinner(winners, row, model, index))}
                    </span>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CompareTableInner({ rows, models, renderValue, mobileLayout = "metric-rows" }: CompareTableProps) {
  const { isMobile } = useDevice();
  const getColor = useModelColorOf();
  const winners = useMemo(() => computeWinners(rows, models, modelKeyOf), [rows, models]);

  const parts = useMemo(
    () => ({ rows, models, getKey: modelKeyOf, getName: modelNameOf, getColor, renderValue, winners }),
    [rows, models, getColor, renderValue, winners],
  );
  if (isMobile) {
    return <MobileTable {...parts} layout={mobileLayout} />;
  }

  return <DesktopTable {...parts} />;
}

export function getWinner(
  winners: Map<string, Map<string, Winner>>,
  row: CompareRow<ArtificialAnalysisModel>,
  model: ArtificialAnalysisModel,
  index: number,
): Winner | null {
  return winners.get(rowKey(row))?.get(modelKeyOf(model, index)) ?? null;
}

export const CompareTable = memo(CompareTableInner) as typeof CompareTableInner;
