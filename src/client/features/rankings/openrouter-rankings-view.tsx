import {
  type DataTableColumn,
  RightAlignedText,
  mobilePrimaryCol,
  monoCol,
  rightCol,
  trendClass,
} from "@/client/components/data/table/table-columns";
import { modelNameCol, RankedTableView } from "@/client/components/data/table";
import { formatShortNumber, formatTrend } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import type { OpenRouterRankEntry, SourcePayload } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import { ShieldAlert } from "lucide-react";
import { EmptyState, PartialNotice } from "@/client/components/feedback";
import { assertPayloadShape, unwrapListPartial } from "@/client/api/payload-normalize";
import { OpenRouterModelDetail } from "@/client/features/models/model-details/openrouter-detail";
import { SEARCH_FIELDS } from "@/client/search/search-fields";
import { useTranslation } from "@/client/providers";

function buildOpenRouterBodyColumns(t: (key: TranslationKey) => string): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
      "45%",
    ),
    monoCol("totalTokens", t("totalTokens"), (item) => formatShortNumber(item.totalTokens), {
      mobilePrimary: true,
      emphasis: "strong",
    }),
    monoCol("inputTokens", t("inputTokens"), (item) => formatShortNumber(item.promptTokens), {
      hiddenMd: true,
      emphasis: "strong",
    }),
    monoCol("outputTokens", t("outputTokens"), (item) => formatShortNumber(item.completionTokens), {
      hiddenMd: true,
      emphasis: "strong",
    }),
    monoCol("requests", t("requests"), (item) => formatShortNumber(item.requestCount), { emphasis: "muted" }),
    rightCol("creator", t("creator"), (item) => (
      <RightAlignedText className="ui-caption">{item.creator || t("unknown")}</RightAlignedText>
    )),
    mobilePrimaryCol("trend", t("trend"), (item) => (
      <span className={cn(trendClass(item.change), "text-xs font-mono tabular-nums inline-block")}>
        {formatTrend(item.change, t)}
      </span>
    )),
  ];
}

const getModelRowId = (r: OpenRouterRankEntry) => r.id;
const getModelRowName = (r: OpenRouterRankEntry) => r.name;
const renderExpandedDetail = (item: OpenRouterRankEntry) => (
  <div className="p-4 sm:p-5">
    <OpenRouterModelDetail model={item} />
  </div>
);

export function OpenRouterRankingsView({ data }: { data?: SourcePayload<OpenRouterRankEntry[]> }) {
  const { t } = useTranslation();

  if (!data) {
    return <EmptyState icon={ShieldAlert} message={t("noRankingsData")} />;
  }

  const { data: rows, partial, malformed } = unwrapListPartial<OpenRouterRankEntry>(data, "openRouterRankings");
  assertPayloadShape(malformed, "openRouterRankings");

  return (
    <>
      {partial && <PartialNotice />}
      <RankedTableView
        rows={rows}
        getRowId={getModelRowId}
        getRowName={getModelRowName}
        getSearchFields={SEARCH_FIELDS.or}
        buildBodyColumns={buildOpenRouterBodyColumns}
        renderExpandedRow={renderExpandedDetail}
      />
    </>
  );
}
