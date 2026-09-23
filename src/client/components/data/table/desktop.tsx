import { Fragment, memo } from "react";
import type { DataTableColumn, RowListProps } from "@/client/components/data/table/table-columns";
import { ExpandToggle, getRowExpandState } from "./row-expand";
import { cn } from "@/client/utils/cn";

function cellClasses<T>(col: DataTableColumn<T>): string {
  return cn("px-4 py-3.5", col.hiddenMd && "hidden md:table-cell");
}

function cellInnerClasses<T>(col: DataTableColumn<T>): string {
  return cn("flex items-center gap-2 min-w-0 [&>*]:min-w-0", col.align === "right" && "justify-end text-right");
}

export function TableHeader<T>({ columns, isExpandable }: { columns: DataTableColumn<T>[]; isExpandable: boolean }) {
  return (
    <thead>
      <tr className="border-b border-border">
        {columns.map((col, colIdx) => (
          <th key={col.id} scope="col" className={cn(cellClasses(col), "ui-table-header")} style={{ width: col.width }}>
            <div className={cellInnerClasses(col)}>
              {isExpandable && colIdx === 0 && <span className="w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate uppercase tracking-caps">{col.header}</span>
            </div>
          </th>
        ))}
      </tr>
    </thead>
  );
}

function TableBodyInner<T>({
  pagedData,
  columns,
  getRowId,
  getRowName,
  isExpandable,
  expandedRowId,
  onToggleExpand,
  renderExpandedRow,
}: RowListProps<T>) {
  return (
    <tbody>
      {pagedData.map((row) => {
        const { rowId, isExpanded, toggle } = getRowExpandState(row, getRowId, expandedRowId, onToggleExpand);
        return (
          <Fragment key={rowId}>
            <tr
              className={cn(
                "border-b border-border last:border-b-0 transition-colors duration-fast bg-bg-card",
                "hoverable:hover:bg-hover",
                isExpanded && "bg-bg-secondary/60",
              )}
            >
              {columns.map((col, colIdx) => (
                <td key={col.id} className={cellClasses(col)} style={{ width: col.width }}>
                  <div className={cellInnerClasses(col)}>
                    {isExpandable && colIdx === 0 ? (
                      <ExpandToggle
                        isExpanded={isExpanded}
                        onToggle={toggle}
                        rowName={getRowName?.(row) ?? rowId}
                        controlsId={`${rowId}-panel`}
                      />
                    ) : null}
                    {col.cell(row)}
                  </div>
                </td>
              ))}
            </tr>
            {isExpanded && renderExpandedRow && (
              <tr className="border-b border-border last:border-b-0 bg-bg-secondary/60">
                <td colSpan={columns.length}>
                  <div id={`${rowId}-panel`} role="region" className="animate-fade-in px-4 py-3">
                    {renderExpandedRow(row)}
                  </div>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </tbody>
  );
}

export const TableBody = memo(TableBodyInner) as typeof TableBodyInner;
