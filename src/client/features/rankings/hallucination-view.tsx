import { formatIndex, formatPercent } from "@/client/utils/format";
import type { HallucinationRankingEntry } from "@/shared/types";
import { RankedTableView, modelNameCol } from "@/client/components/data/table";
import { monoCol, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import type { useTranslation } from "@/client/providers";

function buildHallColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<HallucinationRankingEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.model,
      (item) => item.model,
    ),
    monoCol("hallucinationRate", t("hallucinationRate"), (item) => formatPercent(item.hallucinationRate, t), {
      emphasis: "strong",
    }),
    monoCol("accuracy", t("accuracy"), (item) => formatPercent(item.accuracy, t), { hiddenMd: true }),
    monoCol("attemptRate", t("attemptRate"), (item) => formatPercent(item.attemptRate, t), { hiddenMd: true }),
    monoCol("omniscienceIndex", t("omniscienceIndex"), (item) => formatIndex(item.omniscienceIndex), {
      hiddenMd: true,
    }),
  ];
}

const getHallRowId = (entry: HallucinationRankingEntry) => entry.id || entry.slug || entry.model;

export function HallucinationRankingsView({ rankings }: { rankings: HallucinationRankingEntry[] }) {
  return (
    <RankedTableView
      rows={rankings}
      getRowId={getHallRowId}
      getSearchFields={SEARCH_FIELDS.hall}
      buildBodyColumns={buildHallColumns}
    />
  );
}
