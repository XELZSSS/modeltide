import { Fragment, memo, useEffect, useRef, useState, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";
import { useDevice, useTranslation } from "@/client/providers";
import { EmptyState } from "@/client/components/feedback";
import { Pagination } from "@/client/components/ui/pagination";
import type { DataTableColumn } from "@/client/components/data/columns";
import { DEFAULT_PAGE_SIZE, usePagedData } from "@/client/components/data/use-paged-data";
import { ExpandToggle, getRowExpandState } from "@/client/components/data/expand";

interface RowListProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  isExpandable: boolean;
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => ReactNode;
}

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
  isExpandable,
  expandedRowId,
  onToggleExpand,
  renderExpandedRow,
}: RowListProps<T>) {
  const layout = resolveMobileColumns(columns);
  if (!layout) return null;
  const { primaryCol, mainStatCol, secondaryCols } = layout;
  return (
    <div className="flex flex-col gap-3">
      {pagedData.map((row) => {
        const { rowId, isExpanded, toggle } = getRowExpandState(row, getRowId, expandedRowId, onToggleExpand);
        return (
          <Fragment key={rowId}>
            {}
            <div
              className={cn(
                "border border-border bg-bg-card p-4 transition-colors",
                "hover:bg-hover",
                isExpanded && "bg-accent-light",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpandable ? <ExpandToggle isExpanded={isExpanded} onToggle={toggle} size={16} /> : null}
                <div className="min-w-0 flex-1">{primaryCol?.cell(row)}</div>
                {mainStatCol && (
                  <div className="shrink-0 text-right min-w-0 max-w-[40%]">
                    {mainStatCol.header && (
                      <span className="text-xs text-text-secondary mr-1.5 truncate">{mainStatCol.header}</span>
                    )}
                    <span className="text-sm font-semibold">{mainStatCol.cell(row)}</span>
                  </div>
                )}
              </div>
              {secondaryCols.length > 0 && (
                <div className="flex flex-wrap gap-x-4 gap-y-2 mt-3">
                  {secondaryCols.map((col) => (
                    <div
                      key={col.id}
                      className={cn("flex items-baseline gap-1.5 min-w-0", col.align === "right" && "ml-auto")}
                    >
                      {col.header && <span className="text-xs text-text-secondary shrink-0">{col.header}</span>}
                      <span className="text-sm min-w-0">{col.cell(row)}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
            {isExpanded && renderExpandedRow && (
              <div className="border border-border bg-bg-secondary/50 overflow-hidden animate-slide-up">
                {renderExpandedRow(row)}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

const MobileTableBody = memo(MobileTableBodyInner) as typeof MobileTableBodyInner;

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  renderExpandedRow?: (row: T) => ReactNode;
  resetKey?: string | number;
}

function cellClasses<T>(col: DataTableColumn<T>): string {
  return cn("px-4 py-2.5", col.hiddenMd && "hidden md:table-cell");
}

function cellInnerClasses<T>(col: DataTableColumn<T>): string {
  return cn("flex items-center gap-2 min-w-0 [&>*]:min-w-0", col.align === "right" && "justify-end");
}

function TableHeader<T>({ columns, isExpandable }: { columns: DataTableColumn<T>[]; isExpandable: boolean }) {
  return (
    <thead>
      <tr className="border-b border-border">
        {columns.map((col, colIdx) => (
          <th key={col.id} scope="col" className={cn(cellClasses(col), "ui-table-header")} style={{ width: col.width }}>
            <div className={cellInnerClasses(col)}>
              {isExpandable && colIdx === 0 && <span className="w-3.5 shrink-0" aria-hidden="true" />}
              <span className="truncate">{col.header}</span>
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
            {}
            <tr
              className={cn(
                "border-b border-border last:border-b-0 transition-colors bg-bg-card",
                "hover:bg-hover",
                isExpanded && "bg-accent-light",
              )}
            >
              {columns.map((col, colIdx) => (
                <td key={col.id} className={cellClasses(col)} style={{ width: col.width }}>
                  <div className={cellInnerClasses(col)}>
                    {isExpandable && colIdx === 0 ? <ExpandToggle isExpanded={isExpanded} onToggle={toggle} /> : null}
                    {col.cell(row)}
                  </div>
                </td>
              ))}
            </tr>
            {isExpanded && renderExpandedRow && (
              <tr className="border-b border-border last:border-b-0 bg-bg-secondary/50">
                <td colSpan={columns.length} className="p-0">
                  <div className="animate-fade-in">{renderExpandedRow(row)}</div>
                </td>
              </tr>
            )}
          </Fragment>
        );
      })}
    </tbody>
  );
}

const TableBody = memo(TableBodyInner) as typeof TableBodyInner;

function DataTableInner<T>({ data, columns, getRowId, renderExpandedRow, resetKey }: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const { t } = useTranslation();
  const [ownExpandedId, setOwnExpandedId] = useState<string | null>(null);
  const isExpandable = !!renderExpandedRow;
  const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(
    data,
    getRowId,
    DEFAULT_PAGE_SIZE,
    resetKey,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (ownExpandedId == null) return;
    if (!dedupedData.some((row) => getRowId(row) === ownExpandedId)) setOwnExpandedId(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dedupedData]);

  const handlePageChange = (p: number) => {
    goToPage(p);
    setOwnExpandedId(null);
    rootRef.current?.querySelector<HTMLElement>("[data-table-top]")?.focus?.();
  };

  const pagination =
    totalPages > 1 ? (
      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} className="pt-2 self-center" />
    ) : null;
  const listProps: RowListProps<T> = {
    pagedData,
    columns,
    getRowId,
    isExpandable,
    expandedRowId: ownExpandedId,
    onToggleExpand: setOwnExpandedId,
    renderExpandedRow,
  };

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      <span data-table-top tabIndex={-1} className="outline-none" aria-hidden="true" />
      {dedupedData.length === 0 ? (
        <EmptyState message={t("noResults")} />
      ) : isMobile ? (
        <>
          <MobileTableBody {...listProps} />
          {pagination}
        </>
      ) : (
        <>
          <div className="border border-border overflow-x-auto min-w-0">
            <table className="w-full text-sm table-fixed">
              <TableHeader columns={columns} isExpandable={isExpandable} />
              <TableBody {...listProps} />
            </table>
          </div>
          {pagination}
        </>
      )}
    </div>
  );
}

export const DataTable = memo(DataTableInner) as typeof DataTableInner;
