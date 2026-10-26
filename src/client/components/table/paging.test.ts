import { nextTick, ref } from "vue";
import { describe, expect, it } from "vitest";
import { DEFAULT_PAGE_SIZE, MOBILE_PAGE_SIZE, usePagedData } from "./paging";

interface Row {
  id: string;
  name: string;
}

const rows = (count: number, prefix = "row"): Row[] =>
  Array.from({ length: count }, (_, i) => ({ id: `${prefix}-${i}`, name: `${prefix} ${i}` }));

const byId = (row: Row) => row.id;

const pagedOf = (count: number, pageSize?: number) => usePagedData(ref(rows(count)), byId, pageSize);

/** Row count, requested page size, then the page count and the rows on page 1 it must produce. */
const PAGE_SIZE_CASES: ReadonlyArray<[count: number, pageSize: number | undefined, pages: number, size: number]> = [
  [25, undefined, 2, DEFAULT_PAGE_SIZE],
  [25, MOBILE_PAGE_SIZE, 3, MOBILE_PAGE_SIZE],
  [25, 0, 2, DEFAULT_PAGE_SIZE],
  [25, -1, 2, DEFAULT_PAGE_SIZE],
];

describe("usePagedData", () => {
  it.each(PAGE_SIZE_CASES)("pages %i rows with page size %s into %i pages", (count, pageSize, pages, size) => {
    const paged = pagedOf(count, pageSize);
    expect(paged.totalPages.value).toBe(pages);
    expect(paged.page.value).toBe(1);
    expect(paged.pagedData.value).toHaveLength(size);
    expect(paged.pagedData.value[0]!.id).toBe("row-0");
  });

  it("drops duplicate rows by id before paging", () => {
    const paged = usePagedData(ref([...rows(3), { id: "row-1", name: "dup" }]), byId);
    expect(paged.dedupedData.value.map(byId)).toEqual(["row-0", "row-1", "row-2"]);
    expect(paged.totalPages.value).toBe(1);
  });

  it("clamps goToPage to the available range", () => {
    const paged = pagedOf(45);
    paged.goToPage(0);
    expect(paged.page.value).toBe(1);
    paged.goToPage(999);
    expect(paged.page.value).toBe(3);
    expect(paged.pagedData.value).toHaveLength(5);
  });

  it("resets to page 1 when the reset key changes", async () => {
    const resetKey = ref("aa");
    const paged = usePagedData(ref(rows(45)), byId, DEFAULT_PAGE_SIZE, resetKey);
    paged.goToPage(3);
    expect(paged.page.value).toBe(3);
    resetKey.value = "or";
    await nextTick();
    expect(paged.page.value).toBe(1);
  });

  it("clamps the current page when the data set shrinks", async () => {
    const data = ref(rows(45));
    const paged = usePagedData(data, byId);
    paged.goToPage(3);
    expect(paged.page.value).toBe(3);
    data.value = rows(5);
    await nextTick();
    expect(paged.totalPages.value).toBe(1);
    expect(paged.page.value).toBe(1);
    expect(paged.pagedData.value).toHaveLength(5);
  });

  it("reports page 1 and no pages for an empty data set", () => {
    const paged = usePagedData(ref([] as Row[]), byId);
    expect(paged.totalPages.value).toBe(0);
    expect(paged.page.value).toBe(1);
    expect(paged.pagedData.value).toEqual([]);
  });
});
