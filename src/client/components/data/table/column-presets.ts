import type { VNodeChild } from "vue";
import { col, monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns";

export function scoreCol<T>(id: string, header: string, get: (row: T) => number | null | undefined): DataTableColumn<T> {
  return monoCol(id, header, (row) => {
    const v = get(row);
    return typeof v === "number" && Number.isFinite(v) ? v.toFixed(1) : "—";
  }, { emphasis: "strong" });
}

export function tokenCol<T>(id: string, header: string, get: (row: T) => number | null | undefined): DataTableColumn<T> {
  return monoCol(id, header, (row) => {
    const v = get(row);
    return typeof v === "number" && Number.isFinite(v) ? `$${v.toFixed(2)}` : "—";
  }, { hiddenMd: true });
}

export function providerCol<T>(id: string, header: string, get: (row: T) => string | null | undefined): DataTableColumn<T> {
  return col(id, header, (row) => get(row) ?? "—", { hiddenMd: true });
}

export function trendCol<T>(
  id: string,
  header: string,
  cell: (row: T) => VNodeChild,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return rightCol(id, header, cell, opts);
}
