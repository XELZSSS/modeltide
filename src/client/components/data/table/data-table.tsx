import { memo, useDeferredValue, useMemo, useRef, useState, type ReactNode } from "react";
import { useDevice, useTranslation } from "@/client/providers";
import { EmptyState } from "@/client/components/feedback";
import { Pagination } from "@/client/components/ui/pagination";
import type { DataTableColumn, RowListProps } from "@/client/components/data/table/table-columns";
import { filterByTerm } from "@/client/search/match";
import { useRouteSearchTerm } from "@/client/stores";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "./paging";
import { TableBody, TableHeader } from "./desktop";
import { MobileTableBody } from "./mobile";

interface DataTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
  renderExpandedRow?: (row: T) => ReactNode;
  resetKey?: string | number;
}

function DataTableInner<T>({ data, columns, getRowId, getRowName, renderExpandedRow, resetKey }: DataTableProps<T>) {
  const { isMobile } = useDevice();
  const { t } = useTranslation();
  const [ownExpandedId, setOwnExpandedId] = useState<string | null>(null);
  const isExpandable = !!renderExpandedRow;
  const { dedupedData, page, totalPages, pagedData, goToPage } = usePagedData(
    data,
    getRowId,
    isMobile ? MOBILE_PAGE_SIZE : DEFAULT_PAGE_SIZE,
    resetKey,
  );
  const rootRef = useRef<HTMLDivElement>(null);

  const expandedRowGone = useMemo(
    () => ownExpandedId != null && !dedupedData.some((row) => getRowId(row) === ownExpandedId),
    [dedupedData, getRowId, ownExpandedId],
  );
  if (expandedRowGone) {
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
  const listProps: RowListProps<T> = useMemo(
    () => ({
      pagedData,
      columns,
      getRowId,
      getRowName,
      isExpandable,
      expandedRowId: ownExpandedId,
      onToggleExpand: setOwnExpandedId,
      renderExpandedRow,
    }),
    [pagedData, columns, getRowId, getRowName, isExpandable, ownExpandedId, renderExpandedRow],
  );

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

const DataTable = memo(DataTableInner) as typeof DataTableInner;

interface SearchableDataTableProps<T> extends Omit<DataTableProps<T>, "data"> {
  data: T[];
  getSearchFields: (row: T) => (string | null | undefined)[];
}

function SearchableDataTableInner<T>({ data, getSearchFields, ...tableProps }: SearchableDataTableProps<T>) {
  const { term: searchTerm } = useRouteSearchTerm();
  const deferredTerm = useDeferredValue(searchTerm);
  const filtered = useMemo(
    () => filterByTerm(data, deferredTerm, getSearchFields),
    [data, deferredTerm, getSearchFields],
  );
  return <DataTable data={filtered} resetKey={deferredTerm} {...tableProps} />;
}

export const SearchableDataTable = memo(SearchableDataTableInner) as typeof SearchableDataTableInner;
