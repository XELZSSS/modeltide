import { formatIndex, formatPercent } from "@/client/utils/format";
import type { HallucinationRankingEntry } from "@/shared/types";
import { RankedTableView, modelNameCol } from "@/client/features/rankings/rank-shared";
import type { DataTableColumn } from "@/client/components/data/columns";
import type { useTranslation } from "@/client/providers";

function buildHallColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.model,
      (item) => item.model,
    ),
    {
      id: "hallucinationRate",
      header: t("hallucinationRate"),
      align: "right",
      cell: (item) => <span className="ui-mono-value font-semibold">{formatPercent(t, item.hallucinationRate)}</span>,
    },
    {
      id: "accuracy",
      header: t("accuracy"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatPercent(t, item.accuracy)}</span>,
    },
    {
      id: "attemptRate",
      header: t("attemptRate"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatPercent(t, item.attemptRate)}</span>,
    },
    {
      id: "omniscienceIndex",
      header: t("omniscienceIndex"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="ui-mono-value font-normal">{formatIndex(item.omniscienceIndex)}</span>,
    },
  ];
}

const getHallRowId = (entry: HallucinationRankingEntry) => entry.id || entry.slug || entry.model;
const getHallSearchFields = (entry: HallucinationRankingEntry) => [entry.model];

export function HallucinationRankingsView({ rankings }: { rankings: HallucinationRankingEntry[] }) {
  return (
    <RankedTableView
      rows={rankings}
      getRowId={getHallRowId}
      getSearchFields={getHallSearchFields}
      buildBodyColumns={buildHallColumns}
    />
  );
}
