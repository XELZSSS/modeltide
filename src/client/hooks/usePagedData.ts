import { useCallback, useEffect, useMemo, useState } from "react";
import { dedupeBy } from "@/client/utils";

function usePagination<T>(data: T[], size: number) {
  const [page, setPage] = useState(1);
  const total = Math.ceil(data.length / size);
  const totalPages = total === 0 ? 0 : total;
  const safeTotal = Math.max(1, totalPages);

  useEffect(() => setPage((p) => Math.min(p, safeTotal)), [safeTotal]);

  const cur = totalPages === 0 ? 0 : Math.min(page, totalPages);
  const paged = totalPages === 0 ? [] : data.length > size ? data.slice((cur - 1) * size, cur * size) : data;
  const goToPage = useCallback((p: number) => setPage(Math.max(1, Math.min(p, safeTotal))), [safeTotal]);
  return { page: cur === 0 ? 1 : cur, totalPages, pagedData: paged, goToPage } as const;
}

export function usePagedData<T>(data: T[], getRowId?: (row: T) => string, pageSize = 8) {
  const dedupedData = useMemo(() => (getRowId ? dedupeBy(data, getRowId) : data), [data, getRowId]);
  const { page, totalPages, pagedData, goToPage } = usePagination(dedupedData, pageSize);
  return { dedupedData, page, totalPages, pagedData, goToPage } as const;
}
