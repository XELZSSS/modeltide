import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { RankingNameCell, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { SearchableDataTable } from "./data-table";

export function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => string,
  width = "40%",
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width,
    cell: (row) => {
      const title = titleOf(row);
      const text = textOf(row);
      return <RankingNameCell name={text} title={title} />;
    },
  };
}

type TFn = ReturnType<typeof useTranslation>["t"];
type BodyBuilder<T> = (t: TFn) => DataTableColumn<T>[];

export function useRankedColumns<T>(buildBodyColumns: BodyBuilder<T>): DataTableColumn<T>[] {
  const { t } = useTranslation();
  return useMemo(() => buildBodyColumns(t), [buildBodyColumns, t]);
}

export function RankedTableView<T>({
  rows,
  getRowId,
  getRowName,
  getSearchFields,
  buildBodyColumns,
  renderExpandedRow,
}: {
  rows: T[];
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
  getSearchFields: (row: T) => (string | null | undefined)[];
  buildBodyColumns: BodyBuilder<T>;
  renderExpandedRow?: (item: T) => ReactNode;
}) {
  const columns = useRankedColumns(buildBodyColumns);
  return (
    <SearchableDataTable
      data={rows}
      columns={columns}
      getRowId={getRowId}
      getRowName={getRowName}
      getSearchFields={getSearchFields}
      renderExpandedRow={renderExpandedRow}
    />
  );
}
