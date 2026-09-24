import { useCallback, useMemo, useState } from "react";
import { dedupeBy } from "@/shared/utils";
import { useResetOnChange } from "@/client/hooks/use-reset-on-change";

export const DEFAULT_PAGE_SIZE = 20;
export const MOBILE_PAGE_SIZE = 10;

export function usePagedData<T>(
  data: T[],
  getRowId: (row: T) => string,
  pageSize = DEFAULT_PAGE_SIZE,
  resetKey?: string | number,
) {
  const dedupedData = useMemo(() => dedupeBy(data, getRowId), [data, getRowId]);
  const safeSize = Number.isFinite(pageSize) && pageSize > 0 ? Math.floor(pageSize) : DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(dedupedData.length / safeSize);
  const safeTotal = Math.max(1, totalPages);
  const resetToken = `${resetKey ?? ""}|${safeSize}`;
  const didReset = useResetOnChange(resetToken);
  if (didReset) {
    setPage(1);
  } else if (page > safeTotal) {
    setPage(safeTotal);
  }
  const cur = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const paged = useMemo(
    () => (dedupedData.length > safeSize ? dedupedData.slice((cur - 1) * safeSize, cur * safeSize) : dedupedData),
    [dedupedData, cur, safeSize],
  );
  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.min(p, safeTotal))), [safeTotal]);
  return { dedupedData, page: cur, totalPages, pagedData: paged, goToPage } as const;
}
