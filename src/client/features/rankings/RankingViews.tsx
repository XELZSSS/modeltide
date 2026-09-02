import { useMemo } from "react";
import { useTranslation } from "@/client/providers";
import { useFilteredData } from "@/client/hooks";
import { DataTable, type DataTableColumn } from "@/client/components/data";
import { formatIndex, formatShortNumber, formatPercent, shortModelId } from "@/client/utils";
import type { OpenSourceModelEntry, HallucinationRankingEntry } from "@/shared/types";

export const RANKING_TABS = [
  "modelRankings",
  "openRouterRankings",
  "openSourceRankings",
  "hallucinationRankings",
  "providerCompare",
] as const;

export type RankingTabId = (typeof RANKING_TABS)[number];

interface RankingTableProps<T> {
  data: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  getSearchFields: (row: T) => string[];
}

function RankingTable<T>({ data, columns, getRowId, getSearchFields }: RankingTableProps<T>) {
  // DataTable renders its own empty state when the filtered list is empty.
  const filtered = useFilteredData(data, getSearchFields);
  return <DataTable data={filtered} columns={columns} getRowId={getRowId} />;
}

function buildOpenSourceColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    {
      id: "model",
      header: t("model"),
      cell: (item) => <p className="text-sm font-medium truncate">{shortModelId(item.id)}</p>,
    },
    {
      id: "downloads",
      header: t("downloads"),
      align: "right",
      cell: (item) => <span className="text-sm font-semibold">{formatShortNumber(item.downloads)}</span>,
    },
    {
      id: "likes",
      header: t("likes"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatShortNumber(item.likes)}</span>,
    },
    {
      id: "license",
      header: t("license"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{item.license || t("notAvailable")}</span>,
    },
  ];
}

const getOpenSourceRowId = (model: OpenSourceModelEntry) => model.id;
const getOpenSourceSearchFields = (model: OpenSourceModelEntry) => [model.id];

/** Open-source model table ranked by downloads, with search. */
export function OpenSourceRankingsView({ rankings }: { rankings: OpenSourceModelEntry[] }) {
  const { t } = useTranslation();
  const columns = useMemo(() => buildOpenSourceColumns(t), [t]);
  return (
    <RankingTable
      data={rankings}
      columns={columns}
      getRowId={getOpenSourceRowId}
      getSearchFields={getOpenSourceSearchFields}
    />
  );
}

function buildHallColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    { id: "model", header: t("model"), cell: (item) => <p className="text-sm font-medium truncate">{item.model}</p> },
    {
      id: "hallucinationRate",
      header: t("hallucinationRate"),
      align: "right",
      cell: (item) => <span className="text-sm font-semibold">{formatPercent(t, item.hallucinationRate)}</span>,
    },
    {
      id: "accuracy",
      header: t("accuracy"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatPercent(t, item.accuracy)}</span>,
    },
    {
      id: "attemptRate",
      header: t("attemptRate"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatPercent(t, item.attemptRate)}</span>,
    },
    {
      id: "omniscienceIndex",
      header: t("omniscienceIndex"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{formatIndex(item.omniscienceIndex)}</span>,
    },
  ];
}

const getHallRowId = (entry: HallucinationRankingEntry) => entry.id || entry.slug || entry.model;
const getHallSearchFields = (entry: HallucinationRankingEntry) => [entry.model];

/** Hallucination benchmark table. */
export function HallucinationRankingsView({ rankings }: { rankings: HallucinationRankingEntry[] }) {
  const { t } = useTranslation();
  const columns = useMemo(() => buildHallColumns(t), [t]);
  return (
    <RankingTable data={rankings} columns={columns} getRowId={getHallRowId} getSearchFields={getHallSearchFields} />
  );
}
