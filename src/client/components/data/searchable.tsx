"use client";
import { memo, useDeferredValue, useMemo } from "react";
import { useSearchStore } from "@/client/stores";
import { filterByTerm } from "@/shared/utils";
import { DataTable, type DataTableProps } from "@/client/components/data/table";

function useFilteredData<T>(
  data: T[],
  getFields: (x: T) => (string | null | undefined)[],
  term: string,
): { filtered: T[]; deferredTerm: string } {
  const deferredTerm = useDeferredValue(term);
  const filtered = useMemo(() => filterByTerm(data, deferredTerm, getFields), [data, deferredTerm, getFields]);
  return { filtered, deferredTerm };
}

interface SearchableDataTableProps<T> extends Omit<DataTableProps<T>, "data"> {
  data: T[];
  getSearchFields: (row: T) => (string | null | undefined)[];
}

function SearchableDataTableInner<T>({ data, getSearchFields, ...tableProps }: SearchableDataTableProps<T>) {
  const searchTerm = useSearchStore((s) => s.searchTerm);
  const { filtered, deferredTerm } = useFilteredData(data, getSearchFields, searchTerm);
  // resetKey tracks the deferred term so pagination resets in the same frame
  // the visible list actually changes (no one-keystroke flash).
  return <DataTable data={filtered} resetKey={deferredTerm} {...tableProps} />;
}

export const SearchableDataTable = memo(SearchableDataTableInner) as typeof SearchableDataTableInner;
