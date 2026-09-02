import { memo } from "react";
import { useFilteredData } from "@/client/hooks";
import { useSearchStore } from "@/client/stores";
import { DataTable, type DataTableProps } from "./data-table";

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
