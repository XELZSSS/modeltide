"use client";
import type { ReactNode } from "react";
import type { useTranslation } from "@/client/providers";
import type { DataTableColumn } from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { useRankedColumns } from "@/client/hooks/use-ranked-columns";

export function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => ReactNode,
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width: "40%",
    cell: (row) => (
      <p className="text-sm font-medium truncate" title={titleOf(row)}>
        {textOf(row)}
      </p>
    ),
  };
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
  buildBodyColumns: (t: ReturnType<typeof useTranslation>["t"]) => DataTableColumn<T>[];
}) {
  const columns = useRankedColumns(rows, getRowId, buildBodyColumns);
  return <SearchableDataTable data={rows} columns={columns} getRowId={getRowId} getSearchFields={getSearchFields} />;
}
