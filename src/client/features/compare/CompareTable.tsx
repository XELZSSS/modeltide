"use client";
import { memo, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation, useDevice } from "@/client/providers";
import { useChartTheme, seriesColor } from "@/client/theme/chart-theme";
import { Card, CardContent } from "@/client/components/ui/card";
import { Dot } from "@/client/components/ui/primitives";
import { cn } from "@/client/utils/cn";
import { modelId } from "@/client/utils/model";
import { computeWinners, type CompareRow, type Winner } from "./logic";
import type { ArtificialAnalysisModel } from "@/shared/types";

interface ThProps {
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
  scope?: "col" | "row";
}

const Th = memo(function Th({ align = "left", className, style, children, scope }: ThProps) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-2.5 text-xs font-medium text-text-tertiary",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      style={style}
    >
      {children}
    </th>
  );
});

interface TdProps {
  align?: "left" | "right";
  mono?: boolean;
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

const Td = memo(function Td({ align = "left", mono, className, style, children }: TdProps) {
  return (
    <td
      className={cn(
        "px-4 py-2.5 text-sm",
        mono && "font-mono tabular-nums",
        align === "right" && "text-right",
        className,
      )}
      style={style}
    >
      {children}
    </td>
  );
});

const Tr = memo(function Tr({ className, children, ...props }: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-border last:border-b-0", className)} {...props}>
      {children}
    </tr>
  );
});

interface CompareTableProps<T> {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: Winner | null) => ReactNode;
  mobileLayout?: "metric-rows" | "model-cards";
}

interface TablePartsProps<T> extends Omit<CompareTableProps<T>, "mobileLayout"> {
  winners: Map<string, Map<string, Winner>>;
}

export const modelKeyOf = (m: ArtificialAnalysisModel, index: number) => modelId(m) || `idx-${index}`;
export const modelNameOf = (m: ArtificialAnalysisModel) => m.short_name || m.name;

export function useModelColorOf(): (index: number) => string {
  const theme = useChartTheme();
  return useCallback((index: number) => seriesColor(theme, index), [theme]);
}

function DesktopTable<T>({ rows, models, getKey, getName, getColor, renderValue, winners }: TablePartsProps<T>) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent padding="md">
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
                <Tr key={row.id ?? row.label} className="hover:bg-hover transition-colors">
                  <Th scope="row" className="text-text-secondary sticky left-0 bg-bg-card z-10">
                    {row.label}
                  </Th>
                  {models.map((model, index) => (
                    <Td key={getKey(model, index)} align="right">
                      {renderValue(row, model, winners.get(row.id ?? row.label)?.get(getKey(model, index)) ?? null)}
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

function MobileTable<T>({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  winners,
  layout,
}: TablePartsProps<T> & { layout: "metric-rows" | "model-cards" }) {
  if (layout === "model-cards") {
    return (
      <div className="flex flex-col gap-3">
        {models.map((model, index) => (
          <Card key={getKey(model, index)}>
            <CardContent padding="sm" className="flex flex-col gap-3">
              <p className="flex items-center gap-2 text-sm font-medium truncate" style={{ color: getColor(index) }}>
                <Dot size="sm" color={getColor(index)} />
                {getName(model)}
              </p>
              <div className="flex flex-col gap-2">
                {rows.map((row) => (
                  <div key={row.id ?? row.label} className="flex items-center justify-between gap-3">
                    <span className="ui-caption">{row.label}</span>
                    {renderValue(row, model, winners.get(row.id ?? row.label)?.get(getKey(model, index)) ?? null)}
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
      <CardContent padding="sm">
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const perModel = winners.get(row.id ?? row.label);
            return (
              <div
                key={row.id ?? row.label}
                className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
              >
                <span className="text-xs font-medium text-text-secondary shrink-0">{row.label}</span>
                <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
                  {models.map((model, index) => (
                    <span key={getKey(model, index)} className="flex items-center gap-1">
                      <Dot size="sm" color={getColor(index)} />
                      {renderValue(row, model, perModel?.get(getKey(model, index)) ?? null)}
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

function CompareTableInner<T>({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  mobileLayout = "metric-rows",
}: CompareTableProps<T>) {
  const { isMobile } = useDevice();
  const winners = useMemo(() => computeWinners(rows, models, getKey), [rows, models, getKey]);

  const parts = useMemo(
    () => ({ rows, models, getKey, getName, getColor, renderValue, winners }),
    [rows, models, getKey, getName, getColor, renderValue, winners],
  );
  if (isMobile) {
    return <MobileTable {...parts} layout={mobileLayout} />;
  }

  return <DesktopTable {...parts} />;
}

export const CompareTable = memo(CompareTableInner) as typeof CompareTableInner;
