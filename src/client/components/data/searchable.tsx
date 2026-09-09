"use client";
import { memo, useDeferredValue, useMemo } from "react";
import { useSearchStore } from "@/client/stores";
import { filterByTerm } from "@/shared/utils";
import { DataTable, type DataTableProps } from "@/client/components/data/table";

function useFilteredData<T>(data: T[], getFields: (x: T) => (string | null | undefined)[], term: string): T[] {
  const deferredTerm = useDeferredValue(term);
  return useMemo(() => filterByTerm(data, deferredTerm, getFields), [data, deferredTerm, getFields]);
}

interface SearchableDataTableProps<T> extends Omit<DataTableProps<T>, "data"> {
  data: T[];
  getSearchFields: (row: T) => (string | null | undefined)[];
}

function SearchableDataTableInner<T>({ data, getSearchFields, ...tableProps }: SearchableDataTableProps<T>) {
  const searchTerm = useSearchStore((s) => s.searchTerm);
  const filtered = useFilteredData(data, getSearchFields, searchTerm);
  return <DataTable data={filtered} resetKey={searchTerm} {...tableProps} />;
}

export const SearchableDataTable = memo(SearchableDataTableInner) as typeof SearchableDataTableInner;
