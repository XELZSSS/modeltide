import type { VNodeChild } from "vue";
import { col, monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { FALLBACK_DASH } from "@/shared/config/locale";
import { isFiniteNumber } from "@/shared/utils/numbers";

export function scoreCol<T>(id: string, header: string, get: (row: T) => number | null | undefined): DataTableColumn<T> {
  return monoCol(id, header, (row) => {
    const v = get(row);
    return isFiniteNumber(v) ? v.toFixed(1) : FALLBACK_DASH;
  }, { emphasis: "strong" });
}

export function tokenCol<T>(id: string, header: string, get: (row: T) => number | null | undefined): DataTableColumn<T> {
  return monoCol(id, header, (row) => {
    const v = get(row);
    return isFiniteNumber(v) ? `$${v.toFixed(2)}` : FALLBACK_DASH;
  }, { hiddenMd: true });
}

export function providerCol<T>(id: string, header: string, get: (row: T) => string | null | undefined): DataTableColumn<T> {
  return col(id, header, (row) => get(row) ?? FALLBACK_DASH, { hiddenMd: true });
}

export function trendCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return rightCol(id, header, cell, opts);
}
