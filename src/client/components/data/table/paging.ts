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
  const totalPages = computed(() => Math.ceil(dedupedData.value.length / toValue(pageSize)));
  const safeTotal = computed(() => Math.max(1, totalPages.value));

  watch([() => toValue(resetKey), () => toValue(pageSize)], () => {
    page.value = 1;
  });

  watch(safeTotal, (total) => {
    if (page.value > total) page.value = total;
  });

  const currentPage = computed(() => (totalPages.value === 0 ? 1 : Math.min(page.value, totalPages.value)));

  const pagedData = computed(() => {
    const size = toValue(pageSize);
    const rows = dedupedData.value;
    return rows.length > size ? rows.slice((currentPage.value - 1) * size, currentPage.value * size) : rows;
  });

  function goToPage(p: number): void {
    page.value = Math.max(1, Math.min(p, safeTotal.value));
  }

  return { dedupedData, page: currentPage, totalPages, pagedData, goToPage } as const;
}
