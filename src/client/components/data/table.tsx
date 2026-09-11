"use client";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useDevice, useTranslation } from "@/client/providers";
import { EmptyState } from "@/client/components/feedback";
import { Pagination } from "@/client/components/ui/pagination";
import type { DataTableColumn, RowListProps } from "@/client/components/data/columns";
import { dedupeBy } from "@/shared/utils";
import { MobileTableBody } from "./table-mobile";
import { TableBody, TableHeader } from "./table-desktop";

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
  useEffect(() => setPage((p) => Math.min(p, safeTotal)), [safeTotal]);
  useEffect(() => {
    setPage(1);
  }, [resetKey, safeSize]);
  const cur = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const paged = dedupedData.length > safeSize ? dedupedData.slice((cur - 1) * safeSize, cur * safeSize) : dedupedData;
  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.min(p, safeTotal))), [safeTotal]);
  return { dedupedData, page: cur, totalPages, pagedData: paged, goToPage } as const;
}

export interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  renderExpandedRow?: (row: T) => ReactNode;
  resetKey?: string | number;
}

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
  }, [dedupedData, getRowId]);

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
