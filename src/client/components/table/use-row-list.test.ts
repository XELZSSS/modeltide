import { describe, expect, it } from "vitest";
import type { RowListProps } from "./table-columns";
import { useRowList } from "./use-row-list";

interface Row {
  id: string;
  name: string;
}

const propsOf = (rows: Row[], expandedRowId: string | null) =>
  ({
    pagedData: rows,
    getRowId: (row: Row) => row.id,
    getRowName: (row: Row) => row.name,
    expandedRowId,
  }) as unknown as RowListProps<Row>;

describe("useRowList", () => {
  it("derives ids, names and the expanded flag per row", () => {
    const { rows } = useRowList(
      propsOf(
        [
          { id: "a", name: "Alpha" },
          { id: "b", name: "Beta" },
        ],
        "b",
      ),
    );
    expect(rows.value.map((row) => [row.id, row.name, row.expanded])).toEqual([
      ["a", "Alpha", false],
      ["b", "Beta", true],
    ]);
  });

  it("gives rows with a blank id a positional fallback so only one can expand", () => {
    const { rows } = useRowList(
      propsOf(
        [
          { id: "", name: "First" },
          { id: "", name: "Second" },
        ],
        "row-1",
      ),
    );
    expect(rows.value.map((row) => row.id)).toEqual(["row-0", "row-1"]);
    expect(rows.value.map((row) => row.expanded)).toEqual([false, true]);
  });
});
