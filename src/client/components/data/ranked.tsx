"use client";
import { useMemo } from "react";
import { RankingNameCell, type DataTableColumn } from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { useTranslation } from "@/client/providers";

type TFn = ReturnType<typeof useTranslation>["t"];
type BodyBuilder<T> = (t: TFn) => DataTableColumn<T>[];

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

/**
 * Memoised on the builder's identity. Callers pass the builder inline, so in
 * practice this recomputes with the render — the descriptors are cheap object
 * literals, and correctness beats pinning the builder in a ref that had to be
 * READ during render (which React 19 forbids and which could serve a stale
 * builder).
 */
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
