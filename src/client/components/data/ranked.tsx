"use client";
import { useMemo, useRef } from "react";
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
 * Pin a per-render callback (inline column builder / rank accessor) in a ref
 * so column memos below only recompute when data-affecting inputs change —
 * not when the caller passes a fresh closure identity each render.
 */
function useStableCallback<T extends (...args: never[]) => unknown>(fn: T): React.RefObject<T> {
  const ref = useRef(fn);
  ref.current = fn;
  return ref;
}

export function useRankedColumns<T>(buildBodyColumns: BodyBuilder<T>): DataTableColumn<T>[] {
  const { t } = useTranslation();
  const buildRef = useStableCallback(buildBodyColumns);
  return useMemo(() => buildRef.current(t), [buildRef, t]);
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
