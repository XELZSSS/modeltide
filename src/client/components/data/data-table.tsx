import { Fragment, memo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { useDevice } from "@/client/providers";
import { usePagedData } from "@/client/hooks";
import { cn } from "@/client/utils";
import { Pagination } from "@/client/components/ui";
import type { DataTableColumn } from "./types";
import { ExpandToggle, getRowExpandState, isFromInteractive } from "./expandable-row";
import { MobileTableBody } from "./mobile-card-list";

/** Default rows per page; callers rarely need to override it. */
const DEFAULT_PAGE_SIZE = 8;

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId?: (row: T) => string;
  pageSize?: number;
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => ReactNode;
  onPageChange?: () => void;
  caption?: string;
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

function cellClasses<T>(col: DataTableColumn<T>, isExpandable: boolean): string {
  return cn("px-3 py-3 sm:py-2.5", col.hiddenMd && "hidden md:table-cell", isExpandable && "cursor-pointer");
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
              className={cn(cellClasses(col, false), "font-medium text-text-tertiary whitespace-nowrap")}
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
            <tr
              {...(isExpandable
                ? {
                    onClick: (e) => {
                      if (!isFromInteractive(e.target)) toggle();
                    },
                  }
                : {})}
              className={cn(
                "border-b border-border last:border-b-0 transition-colors bg-bg-card",
                "hover:bg-hover",
                isExpandable && "cursor-pointer active:bg-selected",
                isExpanded && "bg-accent-light",
              )}
            >
              {columns.map((col, colIdx) => (
                <td key={col.id} className={cellClasses(col, isExpandable)} style={{ width: col.width }}>
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
}: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const { t } = useTranslation();
  const isExpandable = !!(renderExpandedRow && onToggleExpand);
  const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(data, getRowId, pageSize);

  const handlePageChange = (p: number) => {
    goToPage(p);
    onPageChange?.();
  };

  const pagination =
    totalPages > 1 ? (
      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} className="pt-1 self-center" />
    ) : null;

  return (
    <div className="flex flex-col gap-2">
      {dedupedData.length === 0 ? (
        <div className="py-12 text-center text-sm text-text-secondary" role="status" aria-live="polite">
          {t("noResults")}
        </div>
      ) : isMobile ? (
        <>
          <MobileTableBody
            pagedData={pagedData}
            columns={columns}
            getRowId={getRowId}
            isExpandable={isExpandable}
            expandedRowId={expandedRowId}
            onToggleExpand={onToggleExpand}
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
                expandedRowId={expandedRowId}
                onToggleExpand={onToggleExpand}
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
