"use client";
import { Fragment, memo } from "react";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn, RowListProps } from "@/client/components/data/columns";
import { ExpandToggle, getRowExpandState } from "@/client/components/data/expand";

interface MobileColumnLayout<T> {
  primaryCol: DataTableColumn<T>;
  mainStatCol?: DataTableColumn<T>;
  secondaryCols: DataTableColumn<T>[];
}

function resolveMobileColumns<T>(columns: DataTableColumn<T>[]): MobileColumnLayout<T> | null {
  if (columns.length === 0) return null;
  const primaryCol = columns.find((col) => !col.hiddenMd) ?? (columns[0] as DataTableColumn<T>);
  const others = columns.filter((col) => col !== primaryCol);
  const mainStatCol = others.find((col) => col.mobilePrimary) ?? others.find((col) => !col.hiddenMd);
  const secondaryCols = others.filter((col) => !col.hiddenMd && col !== mainStatCol);
  return { primaryCol, mainStatCol, secondaryCols };
}

function MobileTableBodyInner<T>({ pagedData, columns, getRowId, isExpandable, expandedRowId, onToggleExpand, renderExpandedRow }: RowListProps<T>) {
  const layout = resolveMobileColumns(columns);
  if (!layout) return null;
  const { primaryCol, mainStatCol, secondaryCols } = layout;
  return (
    <div className="flex flex-col gap-3">
      {pagedData.map((row) => {
        const { rowId, isExpanded, toggle } = getRowExpandState(row, getRowId, expandedRowId, onToggleExpand);
        return (
          <Fragment key={rowId}>
            <div className={cn("border border-border bg-bg-card p-3 sm:p-4 transition-colors", "hover:bg-hover", isExpanded && "bg-accent-light")}>
              <div className="flex items-center gap-2 min-w-0">
                {isExpandable ? <ExpandToggle isExpanded={isExpanded} onToggle={toggle} size={16} /> : null}
                <div className="min-w-0 flex-1">{primaryCol?.cell(row)}</div>
                {mainStatCol && (
                  <div className="shrink-0 text-right min-w-0 max-w-[40%]">
                    {mainStatCol.header && <span className="text-xs text-text-secondary mr-1.5 truncate">{mainStatCol.header}</span>}
                    <div className="text-sm font-semibold">{mainStatCol.cell(row)}</div>
                  </div>
                )}
              </div>
              {secondaryCols.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-1.5 sm:gap-y-2 mt-2 sm:mt-3">
                  {secondaryCols.map((col) => (
                    <div key={col.id} className={cn("flex items-baseline gap-1.5 min-w-0", col.align === "right" && "ml-auto")}>
                      {col.header && <span className="text-xs text-text-secondary shrink-0">{col.header}</span>}
                      <div className="text-sm min-w-0">{col.cell(row)}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isExpanded && renderExpandedRow && (
              <div className="border border-border bg-bg-secondary/50 overflow-hidden animate-slide-up">{renderExpandedRow(row)}</div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export const MobileTableBody = memo(MobileTableBodyInner) as typeof MobileTableBodyInner;
