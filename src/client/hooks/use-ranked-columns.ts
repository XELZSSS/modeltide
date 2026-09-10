"use client";
import { useMemo } from "react";
import { indexRankMap, rankCol, type DataTableColumn } from "@/client/components/data/columns";
import { useTranslation } from "@/client/providers";

export function useRankedColumns<T>(
  rows: T[],
  getRowId: (row: T) => string,
  buildBodyColumns: (t: ReturnType<typeof useTranslation>["t"]) => DataTableColumn<T>[],
): DataTableColumn<T>[] {
  const { t } = useTranslation();
  const rankMap = useMemo(() => indexRankMap(rows, getRowId), [rows, getRowId]);
  return useMemo<DataTableColumn<T>[]>(
    () => [rankCol((r: T) => rankMap.get(getRowId(r)) ?? null), ...buildBodyColumns(t)],
    [t, rankMap, getRowId, buildBodyColumns],
  );
}

export function useRankFieldColumns<T>(
  buildBodyColumns: (t: ReturnType<typeof useTranslation>["t"]) => DataTableColumn<T>[],
  rankOf: (row: T) => number | null | undefined,
): DataTableColumn<T>[] {
  const { t } = useTranslation();
  return useMemo<DataTableColumn<T>[]>(() => [rankCol(rankOf), ...buildBodyColumns(t)], [t, buildBodyColumns, rankOf]);
}
