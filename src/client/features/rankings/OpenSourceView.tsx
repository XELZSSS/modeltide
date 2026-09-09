"use client";
import { formatShortNumber } from "@/client/utils/format";
import { shortModelId } from "@/client/utils/model";
import type { OpenSourceModelEntry } from "@/shared/types";
import { RankedTableView, modelNameCol } from "@/client/features/rankings/rank-shared";
import type { DataTableColumn } from "@/client/components/data/columns";
import type { useTranslation } from "@/client/providers";

function buildOpenSourceColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.id,
      (item) => shortModelId(item.id),
    ),
    {
      id: "downloads",
      header: t("downloads"),
      align: "right",
      cell: (item) => <span className="ui-mono-value font-semibold">{formatShortNumber(item.downloads)}</span>,
    },
    {
      id: "likes",
      header: t("likes"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatShortNumber(item.likes)}</span>,
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

export function OpenSourceRankingsView({ rankings }: { rankings: OpenSourceModelEntry[] }) {
  return (
    <RankedTableView
      rows={rankings}
      getRowId={getOpenSourceRowId}
      getSearchFields={getOpenSourceSearchFields}
      buildBodyColumns={buildOpenSourceColumns}
    />
  );
}
