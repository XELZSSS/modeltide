import { Fragment, memo, useEffect, useState, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { useDevice } from "@/client/providers";
import { usePagedData } from "@/client/hooks";
import { cn } from "@/client/utils";
import { Pagination } from "@/client/components/ui";
import { EmptyState } from "@/client/components/shared";
import type { DataTableColumn } from "./types";
import { ExpandToggle, getRowExpandState } from "./expandable-row";
import { MobileTableBody } from "./mobile-card-list";

/** Default rows per page; callers rarely need to override it. */
const DEFAULT_PAGE_SIZE = 8;

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId?: (row: T) => string;
  pageSize?: number;
  /**
   * Controlled expanded row. Omit both `expandedRowId` and `onToggleExpand` to let
   * the table own the state: it then resets the expansion whenever the page turns
   * or the data set is replaced, so a stale expansion never survives a refetch.
   */
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => ReactNode;
  onPageChange?: () => void;
  caption?: string;
  /** Pagination resets to page 1 whenever this changes (e.g. the search term). */
  resetKey?: string | number;
}

interface TableBodyProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId?: (row: T) => string;
  isExpandable: boolean;
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => ReactNode;
}

function cellClasses<T>(col: DataTableColumn<T>): string {
  return cn("px-3 py-3 sm:py-2.5", col.hiddenMd && "hidden md:table-cell");
}

function cellInnerClasses<T>(col: DataTableColumn<T>): string {
  return cn("flex items-center gap-2 min-w-0", col.align === "right" && "justify-end");
}

function TableHeader<T>({
  columns,
  isExpandable,
  caption,
}: {
  columns: DataTableColumn<T>[];
  isExpandable: boolean;
  caption?: string;
}) {
  return (
    <>
      {caption && <caption className="sr-only">{caption}</caption>}
      <thead>
        <tr className="border-b border-border">
          {columns.map((col, colIdx) => (
            <th
              key={col.id}
              scope="col"
              className={cn(cellClasses(col), "font-medium text-text-tertiary whitespace-nowrap")}
              style={{ width: col.width }}
            >
              <div className={cellInnerClasses(col)}>
                {isExpandable && colIdx === 0 && <span className="w-3.5 shrink-0" aria-hidden="true" />}
                {col.header}
              </div>
            </th>
          ))}
        </tr>
      </thead>
    </>
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
}: TableBodyProps<T>) {
  return (
    <tbody>
      {pagedData.map((row) => {
        const { rowId, isExpanded, toggle } = getRowExpandState(row, getRowId, expandedRowId, onToggleExpand);
        return (
          <Fragment key={rowId}>
            {/* Expansion is toggled only via the ExpandToggle button: a row-level
                onClick would be mouse-only (tr has no keyboard equivalent). */}
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

function DataTableInner<T>({
  data,
  columns,
  getRowId,
  pageSize = DEFAULT_PAGE_SIZE,
  expandedRowId,
  onToggleExpand,
  renderExpandedRow,
  onPageChange,
  caption,
  resetKey,
}: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const { t } = useTranslation();
  // Uncontrolled expand state: used when the caller does not pass expandedRowId/onToggleExpand.
  // The expansion survives filtering and data refreshes (a stale id simply renders collapsed)
  // and only resets when the page turns, matching the pagination-aware behavior callers had.
  const [ownExpandedId, setOwnExpandedId] = useState<string | null>(null);
  const uncontrolled = expandedRowId === undefined && onToggleExpand === undefined;

  const activeExpandedRowId = uncontrolled ? ownExpandedId : expandedRowId;
  const activeToggleExpand = uncontrolled ? setOwnExpandedId : onToggleExpand;
  const isExpandable = !!renderExpandedRow;
  const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(data, getRowId, pageSize, resetKey);

  // Collapse uncontrolled expansion when the dataset changes (e.g. search filter):
  // a stale id could otherwise pop open on an unrelated row of the new data.
  useEffect(() => {
    if (uncontrolled) setOwnExpandedId(null);
  }, [dedupedData, uncontrolled]);

  const handlePageChange = (p: number) => {
    goToPage(p);
    if (uncontrolled) setOwnExpandedId(null);
    onPageChange?.();
  };

  const pagination =
    totalPages > 1 ? (
      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} className="pt-1 self-center" />
    ) : null;

  return (
    <div className="flex flex-col gap-2">
      {dedupedData.length === 0 ? (
        <EmptyState message={t("noResults")} />
      ) : isMobile ? (
        <>
          <MobileTableBody
            pagedData={pagedData}
            columns={columns}
            getRowId={getRowId}
            isExpandable={isExpandable}
            expandedRowId={activeExpandedRowId}
            onToggleExpand={activeToggleExpand}
            renderExpandedRow={renderExpandedRow}
          />
          {pagination}
        </>
      ) : (
        <>
          <div className="border border-border overflow-x-auto min-w-0">
            <table className="w-full text-sm table-auto">
              <TableHeader columns={columns} isExpandable={isExpandable} caption={caption} />
              <TableBody
                pagedData={pagedData}
                columns={columns}
                getRowId={getRowId}
                isExpandable={isExpandable}
                expandedRowId={activeExpandedRowId}
                onToggleExpand={activeToggleExpand}
                renderExpandedRow={renderExpandedRow}
              />
            </table>
          </div>
          {pagination}
        </>
      )}
    </div>
  );
}

/**
 * Paginated data table with optional expandable rows; renders a native table on desktop
 * and a stacked card list on mobile, with a mobile-optimised column layout.
 */
export const DataTable = memo(DataTableInner) as typeof DataTableInner;
