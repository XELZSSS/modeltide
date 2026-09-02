import { memo, useDeferredValue, useMemo } from "react";
import { useSearchStore } from "@/client/stores";
import { matchTerm } from "@/shared/utils";
import { DataTable, type DataTableProps } from "@/client/components/data/table";

function useFilteredData<T>(data: T[], getFields: (x: T) => (string | null | undefined)[], term: string): T[] {
  const deferredTerm = useDeferredValue(term);
  const normalized = deferredTerm.toLowerCase().trim();
  return useMemo(() => {
    if (!normalized) return data;
    return data.filter(
      (x) =>
        matchTerm(
          getFields(x).map((f) => (f ?? "").toLowerCase().trim()),
          normalized,
        ).matched,
    );
  }, [data, normalized, getFields]);
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
