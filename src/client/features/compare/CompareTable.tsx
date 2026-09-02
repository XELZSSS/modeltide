import { memo, useMemo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { useDevice } from "@/client/providers";
import { Card, CardContent, Dot, Td, Th, Tr } from "@/client/components/ui";
import { computeWinners, type CompareRow, type Winner } from "./logic";

interface CompareTableProps<T> {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: Winner | null) => ReactNode;
  mobileLayout?: "metric-rows" | "model-cards";
}

function DesktopTable<T>({
  rows,
  models,
  getKey,
  getName,
  getColor,
  renderValue,
  winners,
}: {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: "win" | "loss" | null) => ReactNode;
  winners: Map<string, Map<string, "win" | "loss">>;
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent padding="md">
        <div className="min-w-0 w-full overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                <Th className="px-3 py-2.5 font-semibold text-text-secondary sticky left-0 z-10 bg-bg-card">
                  {t("metric")}
                </Th>
                {models.map((model, index) => (
                  <Th
                    key={getKey(model, index)}
                    align="right"
                    className="px-3 py-2.5 font-semibold"
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
                  <Th scope="row" className="px-3 py-2.5 text-text-secondary sticky left-0 bg-bg-card z-10">
                    {row.label}
                  </Th>
                  {models.map((model, index) => (
                    <Td key={getKey(model, index)} align="right" className="px-3 py-2.5">
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
}: {
  rows: CompareRow<T>[];
  models: T[];
  getKey: (m: T, index: number) => string;
  getName: (m: T) => string;
  getColor: (index: number) => string;
  renderValue: (row: CompareRow<T>, model: T, winner: "win" | "loss" | null) => ReactNode;
  winners: Map<string, Map<string, "win" | "loss">>;
  layout: "metric-rows" | "model-cards";
}) {
  if (layout === "model-cards") {
    return (
      <div className="flex flex-col gap-2">
        {models.map((model, index) => (
          <Card key={getKey(model, index)}>
            <CardContent className="p-3 flex flex-col gap-2">
              <p className="flex items-center gap-1.5 text-sm font-medium truncate" style={{ color: getColor(index) }}>
                <Dot size="sm" color={getColor(index)} />
                {getName(model)}
              </p>
              <div className="flex flex-col gap-1">
                {rows.map((row) => (
                  <div key={row.id ?? row.label} className="flex items-center justify-between gap-2">
                    <span className="text-xs text-text-secondary">{row.label}</span>
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

  // One card for all metric rows; the caller must not wrap this in another Card.
  return (
    <Card>
      <CardContent padding="sm">
        <div className="flex flex-col divide-y divide-border">
          {rows.map((row) => {
            const perModel = winners.get(row.id ?? row.label);
            return (
              <div
                key={row.id ?? row.label}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0 last:pb-0"
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

  if (isMobile) {
    return (
      <MobileTable
        rows={rows}
        models={models}
        getKey={getKey}
        getName={getName}
        getColor={getColor}
        renderValue={renderValue}
        winners={winners}
        layout={mobileLayout}
      />
    );
  }

  return (
    <DesktopTable
      rows={rows}
      models={models}
      getKey={getKey}
      getName={getName}
      getColor={getColor}
      renderValue={renderValue}
      winners={winners}
    />
  );
}

/** Comparison table with desktop table and unified mobile layout (metric-rows or model-cards). */
export const CompareTable = memo(CompareTableInner) as typeof CompareTableInner;
