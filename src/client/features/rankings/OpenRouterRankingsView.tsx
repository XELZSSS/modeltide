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

// ---- client/features/rankings/openRouterColumns.tsx ----
// Neutral gray for no change; green for growth, red for decline (zero counts as neutral).
function trendClass(change?: number | null) {
  if (change == null || change === 0) return "text-text-tertiary";
  return change > 0 ? "text-success" : "text-destructive";
}

/** Token count or an em-dash when the upstream value is missing (null ≠ 0). */
function tokenText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatShortNumber(v) : "—";
}

/** OpenRouter token-usage columns plus the request-count trend badge. */
export function buildOpenRouterColumns(t: (key: TranslationKey) => string): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    rankCol((item) => item.rank),
    textCol("model", t("model"), (item) => <RankingNameCell name={item.name} />, { width: "45%" }),
    rightCol("totalTokens", t("totalTokens"), (item) => (
      <span className="font-mono font-semibold text-text-primary">{tokenText(item.totalTokens)}</span>
    )),
    rightCol("inputTokens", t("inputTokens"), (item) => (
      <span className="font-mono font-semibold text-text-primary">{tokenText(item.promptTokens)}</span>
    )),
    rightCol("outputTokens", t("outputTokens"), (item) => (
      <span className="font-mono font-semibold text-text-primary">{tokenText(item.completionTokens)}</span>
    )),
    rightCol("requests", t("requests"), (item) => (
      <span className="font-mono text-text-secondary">{tokenText(item.requestCount)}</span>
    )),
    rightCol("creator", t("creator"), (item) => (
      <RightAlignedText className="text-xs">{item.creator || t("unknown")}</RightAlignedText>
    )),
    rightCol("trend", t("trend"), (item) => (
      <span className={cn(trendClass(item.change), "text-xs py-0 font-mono inline-block")}>
        {formatTrend(item.change, t)}
      </span>
    )),
  ];
}

// ---- client/features/rankings/OpenRouterRankingsView.tsx ----
const getModelRowId = (r: OpenRouterRankEntry) => r.id;
const getSearchFields = (r: OpenRouterRankEntry) => [r.name, r.creator, r.id];
const renderExpandedDetail = (item: OpenRouterRankEntry) => (
  <div className="p-4 sm:p-5">
    <OpenRouterModelDetail model={item} />
  </div>
);

/** Token-usage rankings table from OpenRouter, with expandable per-model details. */
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
