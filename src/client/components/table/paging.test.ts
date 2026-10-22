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

describe("usePagedData", () => {
  it("slices the default page size out of the row list", () => {
    const paged = usePagedData(ref(rows(25)), byId);
    expect(paged.totalPages.value).toBe(2);
    expect(paged.page.value).toBe(1);
    expect(paged.pagedData.value).toHaveLength(DEFAULT_PAGE_SIZE);
    expect(paged.pagedData.value[0]!.id).toBe("row-0");
  });

  it("honours a smaller page size such as the mobile one", () => {
    const paged = usePagedData(ref(rows(25)), byId, MOBILE_PAGE_SIZE);
    expect(paged.totalPages.value).toBe(3);
    expect(paged.pagedData.value).toHaveLength(MOBILE_PAGE_SIZE);
  });

  it("drops duplicate rows by id before paging", () => {
    const paged = usePagedData(ref([...rows(3), { id: "row-1", name: "dup" }]), byId);
    expect(paged.dedupedData.value.map(byId)).toEqual(["row-0", "row-1", "row-2"]);
    expect(paged.totalPages.value).toBe(1);
  });

  it("falls back to the default size for a non-positive page size", () => {
    const paged = usePagedData(ref(rows(25)), byId, 0);
    expect(paged.totalPages.value).toBe(2);
  });

  it("clamps goToPage to the available range", () => {
    const paged = usePagedData(ref(rows(45)), byId);
    paged.goToPage(0);
    expect(paged.page.value).toBe(1);
    paged.goToPage(999);
    expect(paged.page.value).toBe(3);
    expect(paged.pagedData.value).toHaveLength(5);
  });

  it("returns to the first page when the reset key changes", async () => {
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
