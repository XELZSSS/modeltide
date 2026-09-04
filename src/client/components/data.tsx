import {
  memo,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useState,
  Fragment,
  type KeyboardEvent as ReactKeyboardEvent,
  type MouseEvent as ReactMouseEvent,
} from "react";
import { cn, dedupeBy } from "@/client/utils";
import { ChevronRight } from "lucide-react";
import { useTranslation, useDevice } from "@/client/providers";
import { useSearchStore } from "@/client/stores";
import { matchTerm } from "@/shared/utils";
import { Pagination } from "@/client/components/ui";
import { EmptyState } from "@/client/components/shared";

// ---- client/components/data/cells.tsx ----
interface RankingNameCellProps {
  name: string;
  /** Optional leading element (e.g. a reasoning badge). */
  prefix?: React.ReactNode;
  /** Optional trailing element (e.g. a compare toggle chip). */
  suffix?: React.ReactNode;
  /** Typography of the name; defaults to the semibold ranking look. */
  nameClassName?: string;
  /** Gap between prefix/name/suffix; defaults to gap-2. */
  gapClassName?: string;
}

/** Model name cell for ranking rows; truncates and can carry leading/trailing elements. */
export const RankingNameCell = memo(function RankingNameCell({
  name,
  prefix,
  suffix,
  nameClassName = "text-sm font-semibold",
  gapClassName = "gap-2",
}: RankingNameCellProps) {
  return (
    <div className={cn("flex items-center min-w-0", gapClassName)}>
      {prefix}
      <p className={cn("truncate flex-1 min-w-0", nameClassName)} title={name}>
        {name || "—"}
      </p>
      {suffix}
    </div>
  );
});

interface RightAlignedTextProps {
  children: ReactNode;
  className?: string;
}

/** Right-aligned text that ellipsizes instead of wrapping, for table/value columns. */
export const RightAlignedText = memo(function RightAlignedText({ children, className }: RightAlignedTextProps) {
  return <p className={cn("overflow-hidden text-ellipsis whitespace-nowrap text-right", className)}>{children}</p>;
});

// ---- client/components/data/column.tsx ----
export interface DataTableColumn<T> {
  id: string;
  header?: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
}

export function textCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { width?: number | string },
): DataTableColumn<T> {
  return { id, header, cell, ...opts };
}

/**
 * Right-aligned numeric column. NOTE: `hiddenMd` defaults to true (narrow-table
 * behavior) and is only overridden when `opts` explicitly passes it — callers
 * relying on visibility must pass `hiddenMd: false` explicitly.
 */
export function rightCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean; width?: number | string },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", hiddenMd: true, ...opts };
}

/** Right-aligned column whose accessor returns null to render the quiet localized "N/A". */
export function rightColNA<T>(
  id: string,
  header: string,
  render: (row: T) => ReactNode | null,
  notAvailableLabel: string,
  opts?: { hiddenMd?: boolean; width?: number | string; mobilePrimary?: boolean },
): DataTableColumn<T> {
  return rightCol(
    id,
    header,
    (row) => {
      const value = render(row);
      // N/A cells stay visually quiet instead of competing with real values.
      return value == null ? (
        <RightAlignedText className="text-text-tertiary">{notAvailableLabel}</RightAlignedText>
      ) : (
        <RightAlignedText>{value}</RightAlignedText>
      );
    },
    opts,
  );
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", hiddenMd: true, mobilePrimary: true, ...opts };
}

/**
 * Global-rank column shared by every rankings table: the rank travels with the
 * row (not the page index), so it stays correct after search filtering. Hidden
 * on mobile where the card layout has no room for a rank gutter.
 */
export function rankCol<T>(rankOf: (row: T) => number | null | undefined): DataTableColumn<T> {
  return {
    id: "rank",
    header: "#",
    width: 76,
    hiddenMd: true,
    cell: (row) => {
      const rank = rankOf(row);
      return (
        <span className="font-mono text-sm font-semibold whitespace-nowrap tabular-nums shrink-0">{rank ?? "—"}</span>
      );
    },
  };
}

/** 1-based global ranks for rows whose display order is already the ranking order. */
export function indexRankMap<T>(rows: T[], getId: (row: T) => string): Map<string, number> {
  return new Map(rows.map((row, i) => [getId(row), i + 1]));
}

// ---- client/components/data/usePagedData.ts ----
function usePagination<T>(data: T[], size: number, resetKey?: string | number) {
  const [page, setPage] = useState(1);
  const total = Math.ceil(data.length / size);
  const totalPages = total === 0 ? 0 : total;
  const safeTotal = Math.max(1, totalPages);

  useEffect(() => setPage((p) => Math.min(p, safeTotal)), [safeTotal]);
  // Filter changes (search term, tab switch) jump back to page 1 instead of
  // stranding the user on an empty page deep in the old result set.
  useEffect(() => {
    setPage(1);
  }, [resetKey]);

  const cur = totalPages === 0 ? 0 : Math.min(page, totalPages);
  const paged = totalPages === 0 ? [] : data.length > size ? data.slice((cur - 1) * size, cur * size) : data;
  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.min(p, safeTotal))), [safeTotal]);
  return { page: cur === 0 ? 1 : cur, totalPages, pagedData: paged, goToPage } as const;
}

export function usePagedData<T>(data: T[], getRowId?: (row: T) => string, pageSize = 8, resetKey?: string | number) {
  const dedupedData = useMemo(() => (getRowId ? dedupeBy(data, getRowId) : data), [data, getRowId]);
  const { page, totalPages, pagedData, goToPage } = usePagination(dedupedData, pageSize, resetKey);
  return { dedupedData, page, totalPages, pagedData, goToPage } as const;
}

// ---- client/components/data/data-table.tsx ----
/** Default rows per page; callers rarely need to override it. */
const DEFAULT_PAGE_SIZE = 8;

/**
 * Deterministic content-based row id used when no getRowId is provided.
 * Fallback only: JSON-hashing every row each render is O(n·m) and the 32-bit
 * hash can collide — tables should pass an explicit getRowId instead.
 */
function rowContentId(row: unknown): string {
  let json: string;
  try {
    json = JSON.stringify(row) ?? "";
  } catch {
    // Circular structures: fall back to a random id (loses expand persistence
    // across renders, but never crashes the table).
    return `row-${Math.random().toString(36).slice(2)}`;
  }
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  return `row-${(hash >>> 0).toString(36)}`;
}

/** Props for the expand toggle button (chevron). */
function expandToggleProps(isExpanded: boolean, toggle: () => void, label: string) {
  return {
    "aria-expanded": isExpanded,
    "aria-label": label,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      toggle();
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    },
  } as const;
}

/** Reusable expand/collapse toggle button with rotating chevron. */
function ExpandToggle({
  isExpanded,
  onToggle,
  size = 14,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  size?: number;
}) {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      {...expandToggleProps(isExpanded, onToggle, isExpanded ? t("collapseRow") : t("expandRow"))}
    >
      <span className={cn("shrink-0 text-text-secondary transition-transform duration-200", isExpanded && "rotate-90")}>
        <ChevronRight size={size} />
      </span>
    </button>
  );
}

/** Shared row expand state. */
function getRowExpandState<T>(
  row: T,
  getRowId: ((row: T) => string) | undefined,
  expandedRowId: string | null | undefined,
  onToggleExpand: ((rowId: string | null) => void) | undefined,
) {
  const rowId = getRowId?.(row) ?? rowContentId(row);
  const isExpanded = expandedRowId === rowId;
  const toggle = () => onToggleExpand?.(isExpanded ? null : rowId);
  return { rowId, isExpanded, toggle };
}

interface MobileCardBodyProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId?: (row: T) => string;
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

// On mobile the table becomes a list: the first visible column is the row title, the
// mobilePrimary-flagged column is emphasized, and the remaining columns are condensed
// into small pairs.
function resolveMobileColumns<T>(columns: DataTableColumn<T>[]): MobileColumnLayout<T> | null {
  if (columns.length === 0) return null;
  const primaryCol = columns.find((col) => !col.hiddenMd) ?? (columns[0] as DataTableColumn<T>);
  // The emphasized stat may be flagged on a column that is hiddenMd (the rightCol /
  // mobilePrimaryCol builders default to hiddenMd); hiddenMd only excludes a column
  // from the desktop narrow table and from the secondary pairs below.
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
}: MobileCardBodyProps<T>) {
  const layout = resolveMobileColumns(columns);
  if (!layout) return null;
  const { primaryCol, mainStatCol, secondaryCols } = layout;
  return (
    <div className="flex flex-col gap-2.5">
      {pagedData.map((row) => {
        const { rowId, isExpanded, toggle } = getRowExpandState(row, getRowId, expandedRowId, onToggleExpand);
        return (
          <Fragment key={rowId}>
            {/* Keyboard users expand via the ExpandToggle button; no card-level
                onClick so there is no mouse-only interaction path. */}
            <div
              className={cn(
                "border border-border bg-bg-card p-3.5 transition-colors",
                "hover:bg-hover",
                isExpanded && "bg-accent-light",
              )}
            >
              <div className="flex items-center gap-2 min-w-0">
                {isExpandable ? <ExpandToggle isExpanded={isExpanded} onToggle={toggle} size={16} /> : null}
                <div className="min-w-0 flex-1">{primaryCol?.cell(row)}</div>
                {mainStatCol && (
                  <div className="shrink-0 text-right min-w-0 max-w-[45%]">
                    {mainStatCol.header && (
                      <span className="text-[11px] sm:text-xs text-text-secondary mr-1 truncate">
                        {mainStatCol.header}
                      </span>
                    )}
                    <span className="text-sm font-semibold">{mainStatCol.cell(row)}</span>
                  </div>
                )}
              </div>
              {secondaryCols.length > 0 && (
                <div className="flex flex-wrap gap-x-3 gap-y-1.5 mt-2.5">
                  {secondaryCols.map((col) => (
                    <div
                      key={col.id}
                      className={cn("flex items-baseline gap-1 min-w-0", col.align === "right" && "ml-auto")}
                    >
                      {col.header && (
                        <span className="text-[11px] sm:text-xs text-text-secondary shrink-0">{col.header}</span>
                      )}
                      <span className="text-xs sm:text-sm min-w-0">{col.cell(row)}</span>
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
  return cn("flex items-center gap-2 min-w-0 [&>*]:min-w-0", col.align === "right" && "justify-end");
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
                <span className="truncate">{col.header}</span>
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
            <table className="w-full text-sm table-fixed">
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

/**
 * Filters `data` by the global search term (case-insensitive substring/prefix).
 * Full-scan O(n) per keystroke; tables paginate (pageSize 8-20) so render cost
 * stays bounded, but 10k+ row datasets should add virtualization (e.g. virtua).
 */
function useFilteredData<T>(data: T[], getFields: (x: T) => string[]): T[] {
  const term = useSearchStore((s) => s.searchTerm)
    .toLowerCase()
    .trim();
  return useMemo(() => {
    if (!term) return data;
    return data.filter(
      (x) =>
        matchTerm(
          getFields(x).map((f) => f.toLowerCase().trim()),
          term,
        ).matched,
    );
  }, [data, term, getFields]);
}

interface SearchableDataTableProps<T> extends Omit<DataTableProps<T>, "data"> {
  data: T[];
  /** Fields the global search term matches against; keep identity stable (module-level const or useCallback). */
  getSearchFields: (row: T) => string[];
}

/**
 * DataTable wired to the global search store: filters `data` by the search term
 * before handing it to the table, collapsing the filter+table boilerplate shared
 * by the rankings, releases and AA views.
 */
function SearchableDataTableInner<T>({ data, getSearchFields, ...tableProps }: SearchableDataTableProps<T>) {
  const filtered = useFilteredData(data, getSearchFields);
  const searchTerm = useSearchStore((s) => s.searchTerm);
  return <DataTable data={filtered} resetKey={searchTerm} {...tableProps} />;
}

export const SearchableDataTable = memo(SearchableDataTableInner) as typeof SearchableDataTableInner;
