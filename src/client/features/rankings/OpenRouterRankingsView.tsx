import {
  type DataTableColumn,
  RankingNameCell,
  RightAlignedText,
  mobilePrimaryCol,
  rankCol,
  rightCol,
  textCol,
} from "@/client/components/data/columns";
import { SearchableDataTable } from "@/client/components/data/searchable";
import { formatShortNumber, formatTrend } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import type { OpenRouterRankEntry, OpenRouterRankingsPayload } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/client/components/feedback";
import { OpenRouterModelDetail } from "@/client/features/models/model-details/or-detail";
import { useTranslation } from "@/client/providers";

function trendClass(change?: number | null) {
  if (change == null || change === 0) return "text-text-tertiary";
  return change > 0 ? "text-success" : "text-destructive";
}

function tokenText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatShortNumber(v) : "—";
}

function tokenCol(
  id: string,
  header: string,
  get: (item: OpenRouterRankEntry) => number | null | undefined,
  opts?: { primary?: boolean; muted?: boolean },
): DataTableColumn<OpenRouterRankEntry> {
  const col = opts?.primary ? mobilePrimaryCol : rightCol;
  return col(id, header, (item) => (
    <span className={`ui-mono-value ${opts?.muted ? "font-normal text-text-secondary" : "font-semibold"}`}>
      {tokenText(get(item))}
    </span>
  ));
}

export function buildOpenRouterColumns(t: (key: TranslationKey) => string): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    rankCol((item) => item.rank),
    textCol("model", t("model"), (item) => <RankingNameCell name={item.name} />, { width: "45%" }),
    tokenCol("totalTokens", t("totalTokens"), (item) => item.totalTokens, { primary: true }),
    tokenCol("inputTokens", t("inputTokens"), (item) => item.promptTokens),
    tokenCol("outputTokens", t("outputTokens"), (item) => item.completionTokens),
    tokenCol("requests", t("requests"), (item) => item.requestCount, { muted: true }),
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
const getSearchFields = (r: OpenRouterRankEntry) => [r.name, r.creator, r.id];
const renderExpandedDetail = (item: OpenRouterRankEntry) => (
  <div className="p-4 sm:p-5">
    <OpenRouterModelDetail model={item} />
  </div>
);

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
