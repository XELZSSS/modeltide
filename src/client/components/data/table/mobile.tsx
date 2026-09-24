import { Fragment, memo, useMemo, type ReactNode } from "react";
import type { DataTableColumn, RowListProps } from "@/client/components/data/table/table-columns";
import { ExpandToggle } from "./row-expand";
import { cn } from "@/client/utils/cn";

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

function MobileTableBodyInner<T>({
  pagedData,
  columns,
  getRowId,
  getRowName,
  isExpandable,
  expandedRowId,
  onToggleExpand,
  renderExpandedRow,
}: RowListProps<T>) {
  const layout = useMemo(() => resolveMobileColumns(columns), [columns]);
  if (!layout) return null;
  return (
    <div className="flex flex-col gap-3">
      {pagedData.map((row) => {
        const rowId = getRowId(row);
        return (
          <MobileCard
            key={rowId}
            row={row}
            layout={layout}
            rowId={rowId}
            rowName={getRowName?.(row) ?? rowId}
            isExpandable={isExpandable}
            isExpanded={expandedRowId === rowId}
            onToggleExpand={onToggleExpand}
            renderExpandedRow={renderExpandedRow}
          />
        );
      })}
    </div>
  );
}

interface MobileCardProps<T> {
  row: T;
  layout: MobileColumnLayout<T>;
  rowId: string;
  rowName: string;
  isExpandable: boolean;
  isExpanded: boolean;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => ReactNode;
}

function MobileCardInner<T>({
  row,
  layout,
  rowId,
  rowName,
  isExpandable,
  isExpanded,
  onToggleExpand,
  renderExpandedRow,
}: MobileCardProps<T>) {
  const { primaryCol, mainStatCol, secondaryCols } = layout;
  return (
    <Fragment>
      <div
        className={cn(
          "border border-border bg-bg-card p-4 overflow-hidden transition-colors duration-fast",
          "hoverable:hover:border-text-tertiary/40",
          isExpanded && "border-text-tertiary/40",
        )}
      >
        <div className="flex items-center gap-2 min-w-0">
          {isExpandable ? (
            <ExpandToggle
              isExpanded={isExpanded}
              onToggle={() => onToggleExpand?.(isExpanded ? null : rowId)}
              rowName={rowName}
              size={16}
              controlsId={`${rowId}-panel`}
            />
          ) : null}
          <div className="min-w-0 flex-1">{primaryCol?.cell(row)}</div>
          {mainStatCol && (
            <div className="shrink-0 text-right min-w-0 max-w-[40%]">
              {mainStatCol.header && <span className="ui-meta mr-1.5 truncate">{mainStatCol.header}</span>}
              <div className="ui-mono-value font-semibold">{mainStatCol.cell(row)}</div>
            </div>
          )}
        </div>
        {secondaryCols.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3 border-t border-border/60 pt-3">
            {secondaryCols.map((col) => (
              <div
                key={col.id}
                className={cn("flex items-baseline gap-1.5 min-w-0", col.align === "right" && "ml-auto")}
              >
                {col.header && <span className="ui-meta shrink-0">{col.header}</span>}
                <div className="ui-body min-w-0">{col.cell(row)}</div>
              </div>
            ))}
          </div>
        )}
      </div>
      {isExpanded && renderExpandedRow && (
        <div
          id={`${rowId}-panel`}
          role="region"
          aria-label={rowName}
          className="border border-t-0 border-border bg-bg-secondary/60 px-4 py-3 overflow-hidden animate-slide-up"
        >
          {renderExpandedRow(row)}
        </div>
      )}
    </Fragment>
  );
}

const MobileCard = memo(MobileCardInner) as typeof MobileCardInner;

export const MobileTableBody = memo(MobileTableBodyInner) as typeof MobileTableBodyInner;
