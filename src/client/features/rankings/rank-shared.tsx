import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { indexRankMap, rankCol, type DataTableColumn } from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { Badge } from "@/client/components/ui/primitives";
import { formatPricePerMillion, formatShortNumber } from "@/client/utils/format";
import type { ArenaRankEntry } from "@/shared/types";

export function modelNameCol<T>(
  header: string,
  titleOf: (row: T) => string,
  textOf: (row: T) => ReactNode,
): DataTableColumn<T> {
  return {
    id: "model",
    header,
    width: "40%",
    cell: (row) => (
      <p className="text-sm font-medium truncate" title={titleOf(row)}>
        {textOf(row)}
      </p>
    ),
  };
}

export function RankedTableView<T>({
  rows,
  getRowId,
  getSearchFields,
  buildBodyColumns,
}: {
  rows: T[];
  getRowId: (row: T) => string;
  getSearchFields: (row: T) => (string | null | undefined)[];
  buildBodyColumns: (t: ReturnType<typeof useTranslation>["t"]) => DataTableColumn<T>[];
}) {
  const { t } = useTranslation();
  const rankMap = useMemo(() => indexRankMap(rows, getRowId), [rows, getRowId]);
  const columns = useMemo<DataTableColumn<T>[]>(
    () => [rankCol((r: T) => rankMap.get(getRowId(r)) ?? null), ...buildBodyColumns(t)],
    [t, rankMap, getRowId, buildBodyColumns],
  );
  return <SearchableDataTable data={rows} columns={columns} getRowId={getRowId} getSearchFields={getSearchFields} />;
}

export function buildArenaColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<ArenaRankEntry>[] {
  return [
    rankCol((item) => item.rank),
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => (
        <>
          {item.name}
          {item.preliminary && (
            <Badge className="ml-1.5 align-middle text-warning border-warning/40">{t("preliminary")}</Badge>
          )}
        </>
      ),
    ),
    {
      id: "score",
      header: t("score"),
      align: "right",
      cell: (item) => (
        <span className="ui-mono-value font-semibold">
          {item.score != null ? Math.round(item.score).toLocaleString("en-US") : t("notAvailable")}
        </span>
      ),
    },
    {
      id: "votes",
      header: t("votes"),
      align: "right",
      hiddenMd: true,
      cell: (item) => (
        <span className="ui-mono-value font-normal">
          {item.votes != null ? formatShortNumber(item.votes) : t("notAvailable")}
        </span>
      ),
    },
    {
      id: "price",
      header: t("pricing"),
      align: "right",
      hiddenMd: true,
      cell: (item) => (
        <span className="text-sm">
          {item.priceInput != null && item.priceOutput != null
            ? formatPricePerMillion(item.priceInput, t)
            : t("notAvailable")}
        </span>
      ),
    },
  ];
}

export const getArenaRowId = (entry: ArenaRankEntry) => `${entry.rank}|${entry.id}`;
export const getArenaSearchFields = (entry: ArenaRankEntry) => [entry.name, entry.id, entry.creator];

export function ArenaTable({ entries }: { entries: ArenaRankEntry[] }) {
  const { t } = useTranslation();
  const columns = useMemo(() => buildArenaColumns(t), [t]);
  return (
    <SearchableDataTable
      data={entries}
      columns={columns}
      getRowId={getArenaRowId}
      getSearchFields={getArenaSearchFields}
    />
  );
}
