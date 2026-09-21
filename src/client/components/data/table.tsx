"use client";
import { Fragment, memo, useCallback, useMemo, useRef, useState, type ReactNode } from "react";
import { ChevronRight } from "lucide-react";
import { useDevice, useTranslation } from "@/client/providers";
import { EmptyState } from "@/client/components/feedback";
import { Pagination } from "@/client/components/ui/pagination";
import { Button } from "@/client/components/ui/button";
import type { DataTableColumn, RowListProps } from "@/client/components/data/table-columns";
import { RankingNameCell } from "@/client/components/data/table-columns";
import { dedupeBy, filterByTerm } from "@/shared/utils";
import { useSearchStore } from "@/client/stores";
import { useDeferredValue } from "react";
import { cn } from "@/client/utils/cn";

const DEFAULT_PAGE_SIZE = 8;

export function usePagedData<T>(
  data: T[],
  getRowId: (row: T) => string,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey?: string | number,
) {
  const dedupedData = useMemo(() => dedupeBy(data, getRowId), [data, getRowId]);
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(dedupedData.length / safeSize);
  const safeTotal = Math.max(1, totalPages);
  const resetToken = `${resetKey ?? ""}|${safeSize}`;
  const [prevResetToken, setPrevResetToken] = useState(resetToken);
  if (prevResetToken !== resetToken) {
    setPrevResetToken(resetToken);
    setPage(1);
  } else if (page > safeTotal) {
    setPage(safeTotal);
  }
  const cur = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const paged = dedupedData.length > safeSize ? dedupedData.slice((cur - 1) * safeSize, cur * safeSize) : dedupedData;
  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.min(p, safeTotal))), [safeTotal]);
  return { dedupedData, page: cur, totalPages, pagedData: paged, goToPage } as const;
}

export function getRowExpandState<T>(
  row: T,
  getRowId: (row: T) => string,
  expandedRowId: string | null | undefined,
  onToggleExpand: ((rowId: string | null) => void) | undefined,
) {
  const rowId = getRowId(row);
  const isExpanded = expandedRowId === rowId;
  const toggle = () => onToggleExpand?.(isExpanded ? null : rowId);
  return { rowId, isExpanded, toggle };
}

export function ExpandToggle({
  isExpanded,
  onToggle,
  size = 14,
  controlsId,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  size?: number;
  controlsId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 size-7"
      aria-expanded={isExpanded}
      aria-label={isExpanded ? t("collapseRow") : t("expandRow")}
      {...(controlsId ? { "aria-controls": controlsId } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span className={cn("shrink-0 text-text-secondary transition-transform duration-fast", isExpanded && "rotate-90")}>
        <ChevronRight size={size} />
      </span>
    </Button>
  );
}

function cellClasses<T>(col: DataTableColumn<T>): string {
  return cn("px-4 py-4", col.hiddenMd && "hidden md:table-cell");
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
              <span className="truncate uppercase tracking-[0.14em]">{col.header}</span>
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
            <tr
              className={cn(
                "border-b border-border last:border-b-0 transition-colors duration-fast bg-bg-card",
                "hoverable:hover:bg-bg-secondary/50",
                isExpanded && "bg-bg-secondary/60",
              )}
            >
              {columns.map((col, colIdx) => (
                <td key={col.id} className={cellClasses(col)} style={{ width: col.width }}>
                  <div className={cellInnerClasses(col)}>
                    {isExpandable && colIdx === 0 ? (
                      <ExpandToggle isExpanded={isExpanded} onToggle={toggle} controlsId={`${rowId}-panel`} />
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
            <div
              className={cn(
                "border border-border bg-bg-card p-4 overflow-hidden transition-colors duration-fast",
                "hoverable:hover:border-text-tertiary/40",
                isExpanded && "border-text-tertiary/40",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpandable ? (
                  <ExpandToggle isExpanded={isExpanded} onToggle={toggle} size={16} controlsId={`${rowId}-panel`} />
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
                className="border border-t-0 border-border bg-bg-secondary/60 px-4 py-3 overflow-hidden animate-slide-up"
              >
                {renderExpandedRow(row)}
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

export const MobileTableBody = memo(MobileTableBodyInner) as typeof MobileTableBodyInner;

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  renderExpandedRow?: (row: T) => ReactNode;
  resetKey?: string | number;
  pageSize?: number;
}

function DataTableInner<T>({ data, columns, getRowId, renderExpandedRow, resetKey, pageSize }: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const { t } = useTranslation();
  const [ownExpandedId, setOwnExpandedId] = useState<string | null>(null);
  const isExpandable = !!renderExpandedRow;
  const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(
    data,
    getRowId,
    pageSize ?? DEFAULT_PAGE_SIZE,
    resetKey,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  if (ownExpandedId != null && !dedupedData.some((row) => getRowId(row) === ownExpandedId)) {
    setOwnExpandedId(null);
  }

  const handlePageChange = (p: number) => {
    goToPage(p);
    setOwnExpandedId(null);
    rootRef.current?.querySelector<HTMLElement>("[data-table-top]")?.focus?.();
  };

  const pagination =
    totalPages > 1 ? (
      <Pagination page={page} totalPages={totalPages} onChange={handlePageChange} className="justify-center" />
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
    <div ref={rootRef} className="flex flex-col gap-4 min-w-0">
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
          <div className="ui-card overflow-x-auto">
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

function useFilteredData<T>(
  data: T[],
  getFields: (x: T) => (string | null | undefined)[],
  term: string,
): { filtered: T[]; deferredTerm: string } {
  const deferredTerm = useDeferredValue(term);
  const filtered = useMemo(() => filterByTerm(data, deferredTerm, getFields), [data, deferredTerm, getFields]);
  return { filtered, deferredTerm };
}

export interface SearchableDataTableProps<T> extends Omit<DataTableProps<T>, "data"> {
  data: T[];
  getSearchFields: (row: T) => (string | null | undefined)[];
}

function SearchableDataTableInner<T>({ data, getSearchFields, ...tableProps }: SearchableDataTableProps<T>) {
  const searchTerm = useSearchStore((s) => s.searchTerm);
  const { filtered, deferredTerm } = useFilteredData(data, getSearchFields, searchTerm);
  return <DataTable data={filtered} resetKey={deferredTerm} {...tableProps} />;
}

export const SearchableDataTable = memo(SearchableDataTableInner) as typeof SearchableDataTableInner;

export function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => string,
  width = "40%",
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width,
    cell: (row) => {
      const title = titleOf(row);
      const text = textOf(row);
      return <RankingNameCell name={text} title={title} />;
    },
  };
}

type TFn = ReturnType<typeof useTranslation>["t"];
type BodyBuilder<T> = (t: TFn) => DataTableColumn<T>[];

export function useRankedColumns<T>(buildBodyColumns: BodyBuilder<T>): DataTableColumn<T>[] {
  const { t } = useTranslation();
  return useMemo(() => buildBodyColumns(t), [buildBodyColumns, t]);
}

export function RankedTableView<T>({
  rows,
  getRowId,
  getSearchFields,
  buildBodyColumns,
}: {
  rows: T[];
  getRowId: (row: T) => string;
  getSearchFields: (row: T) => (string | null | undefined)[];
  buildBodyColumns: BodyBuilder<T>;
}) {
  const columns = useRankedColumns(buildBodyColumns);
  return <SearchableDataTable data={rows} columns={columns} getRowId={getRowId} getSearchFields={getSearchFields} />;
}
