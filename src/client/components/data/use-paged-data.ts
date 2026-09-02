import { useCallback, useEffect, useMemo, useState } from "react";
import { dedupeBy } from "@/shared/utils";

function usePagination<T>(data: T[], size: number, resetKey?: string | number) {
  const safeSize = Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_PAGE_SIZE;
  const [page, setPage] = useState(1);
  const totalPages = Math.ceil(data.length / safeSize);
  const safeTotal = Math.max(1, totalPages);

  useEffect(() => setPage((p) => Math.min(p, safeTotal)), [safeTotal]);
  useEffect(() => {
    setPage(1);
  }, [resetKey, safeSize]);

  const cur = totalPages === 0 ? 1 : Math.min(page, totalPages);
  const paged = data.length > safeSize ? data.slice((cur - 1) * safeSize, cur * safeSize) : data;
  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.min(p, safeTotal))), [safeTotal]);
  return { page: cur, totalPages, pagedData: paged, goToPage } as const;
}

export function usePagedData<T>(data: T[], getRowId: (row: T) => string, pageSize = 8, resetKey?: string | number) {
  const dedupedData = useMemo(() => dedupeBy(data, getRowId), [data, getRowId]);
  const { page, totalPages, pagedData, goToPage } = usePagination(dedupedData, pageSize, resetKey);
  return { dedupedData, page, totalPages, pagedData, goToPage } as const;
}

export const DEFAULT_PAGE_SIZE = 8;
