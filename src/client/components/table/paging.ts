/**
 * Page state for a data table: de-duplicated rows, the current page clamped to the page count, and the slice the table
 * renders. The page size is a getter so the same table can use a smaller page on a phone, and the page resets when the
 * search term or the page size changes.
 */
import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { dedupeBy } from "@/shared/utils";

export const DEFAULT_PAGE_SIZE = 20;
export const MOBILE_PAGE_SIZE = 10;

export function usePagedData<T>(
  data: MaybeRefOrGetter<T[]>,
  getRowId: (row: T) => string,
  pageSize: MaybeRefOrGetter<number> = DEFAULT_PAGE_SIZE,
  resetKey?: MaybeRefOrGetter<string | number | undefined>,
) {
  const dedupedData = computed(() => dedupeBy(toValue(data), getRowId));
  const page = ref(1);
  // A page size outside the two constants above is still a number the caller owns, so the same tolerance the rest of
  // this function shows for out-of-range state (`safeTotal`, `currentPage`) applies here instead of a divide by zero.
  const safePageSize = computed(() => {
    const size = toValue(pageSize);
    return Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_PAGE_SIZE;
  });
  const totalPages = computed(() => Math.ceil(dedupedData.value.length / safePageSize.value));
  const safeTotal = computed(() => Math.max(1, totalPages.value));

  watch([() => toValue(resetKey), () => toValue(pageSize)], () => {
    page.value = 1;
  });

  watch(safeTotal, (total) => {
    if (page.value > total) page.value = total;
  });

  // `page` never leaves 1..`safeTotal` (it starts at 1, `goToPage` clamps it and the watcher above only lowers it),
  // so clamping against `safeTotal` already answers 1 for an empty set.
  const currentPage = computed(() => Math.min(page.value, safeTotal.value));

  const pagedData = computed(() => {
    const size = safePageSize.value;
    const rows = dedupedData.value;
    return rows.length > size ? rows.slice((currentPage.value - 1) * size, currentPage.value * size) : rows;
  });

  function goToPage(p: number): void {
    page.value = Math.max(1, Math.min(p, safeTotal.value));
  }

  return { dedupedData, page: currentPage, totalPages, pagedData, goToPage } as const;
}
