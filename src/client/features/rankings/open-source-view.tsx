import { formatShortNumber } from "@/client/utils/format";
import { shortModelId } from "@/client/utils/model-utils";
import type { OpenSourceModelEntry } from "@/shared/types";
import { RankedTableView, modelNameCol } from "@/client/components/data/table";
import { monoCol, rightCol, type DataTableColumn } from "@/client/components/data/table/table-columns";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import type { useTranslation } from "@/client/providers";

function buildOpenSourceColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OpenSourceModelEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.id,
      (item) => shortModelId(item.id),
    ),
    monoCol("downloads", t("downloads"), (item) => formatShortNumber(item.downloads), { emphasis: "strong" }),
    monoCol("likes", t("likes"), (item) => formatShortNumber(item.likes), { hiddenMd: true }),
    rightCol("license", t("license"), (item) => <span className="text-sm">{item.license || t("notAvailable")}</span>, {
      hiddenMd: true,
    }),
  ];
}

const getOpenSourceRowId = (model: OpenSourceModelEntry) => model.id;

export function OpenSourceRankingsView({ rankings }: { rankings: OpenSourceModelEntry[] }) {
  return (
    <RankedTableView
      rows={rankings}
      getRowId={getOpenSourceRowId}
      getSearchFields={SEARCH_FIELDS.os}
      buildBodyColumns={buildOpenSourceColumns}
    />
  );
}
