import {
  type DataTableColumn,
  RankingNameCell,
  RightAlignedText,
  rankCol,
  rightCol,
  textCol,
  SearchableDataTable,
} from "@/client/components/data";
import { formatShortNumber, formatTrend, cn } from "@/client/utils";
import type { OpenRouterRankEntry, OpenRouterRankingsPayload } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/client/components/shared";
import { OpenRouterModelDetail } from "@/client/features/models/ModelDetailView";
import { useTranslation } from "@/client/providers";

// ---- openRouterColumns ----
// Gray for no change; green growth, red decline.
function trendClass(change?: number | null) {
  if (change == null || change === 0) return "text-text-tertiary";
  return change > 0 ? "text-success" : "text-destructive";
}

/** Token count, or em-dash when missing (null means missing, not 0). */
function tokenText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatShortNumber(v) : "—";
}

/** Token-usage columns plus the request-count trend badge. */
export function buildOpenRouterColumns(t: (key: TranslationKey) => string): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    rankCol((item) => item.rank),
    textCol("model", t("model"), (item) => <RankingNameCell name={item.name} />, { width: "45%" }),
    rightCol("totalTokens", t("totalTokens"), (item) => (
      <span className="ui-mono-value font-semibold">{tokenText(item.totalTokens)}</span>
    )),
    rightCol("inputTokens", t("inputTokens"), (item) => (
      <span className="ui-mono-value font-semibold">{tokenText(item.promptTokens)}</span>
    )),
    rightCol("outputTokens", t("outputTokens"), (item) => (
      <span className="ui-mono-value font-semibold">{tokenText(item.completionTokens)}</span>
    )),
    rightCol("requests", t("requests"), (item) => (
      <span className="ui-mono-value font-normal text-text-secondary">{tokenText(item.requestCount)}</span>
    )),
    rightCol("creator", t("creator"), (item) => (
      <RightAlignedText className="ui-caption">{item.creator || t("unknown")}</RightAlignedText>
    )),
    rightCol("trend", t("trend"), (item) => (
      <span className={cn(trendClass(item.change), "text-xs font-mono tabular-nums inline-block")}>
        {formatTrend(item.change, t)}
      </span>
    )),
  ];
}

// ---- OpenRouterRankingsView ----
const getModelRowId = (r: OpenRouterRankEntry) => r.id;
const getSearchFields = (r: OpenRouterRankEntry) => [r.name, r.creator, r.id];
const renderExpandedDetail = (item: OpenRouterRankEntry) => (
  <div className="p-4 sm:p-5">
    <OpenRouterModelDetail model={item} />
  </div>
);

/** Token-usage rankings table with expandable per-model details. */
export function OpenRouterRankingsView({ data }: { data?: OpenRouterRankingsPayload }) {
  const { t } = useTranslation();
  const modelColumns = useMemo(() => buildOpenRouterColumns(t), [t]);

  if (!data) {
    return <EmptyState icon={ShieldAlert} message={t("noRankingsData")} />;
  }

  return (
    <SearchableDataTable
      data={data.tokenUsageRankings ?? []}
      columns={modelColumns}
      getRowId={getModelRowId}
      getSearchFields={getSearchFields}
      renderExpandedRow={renderExpandedDetail}
    />
  );
}
