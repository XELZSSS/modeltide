"use client";
import {
  type DataTableColumn,
  RightAlignedText,
  mobilePrimaryCol,
  rightCol,
  trendClass,
} from "@/client/components/data/table-columns";
import { modelNameCol } from "@/client/components/data/table";
import { SearchableDataTable } from "@/client/components/data/table";
import { formatShortNumber, formatTrend } from "@/client/utils/format";
import { cn } from "@/client/utils/cn";
import type { OpenRouterRankEntry, OpenRouterRankingsPayload } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";
import { ShieldAlert } from "lucide-react";
import { EmptyState } from "@/client/components/feedback";
import { OpenRouterModelDetail } from "@/client/features/models/model-details/openrouter-detail";
import { useTranslation } from "@/client/providers";
import { useRankedColumns } from "@/client/components/data/table";

function tokenText(v: number | null | undefined): string {
  return typeof v === "number" && Number.isFinite(v) ? formatShortNumber(v) : "—";
}

function tokenCol(
  id: string,
  header: string,
  get: (item: OpenRouterRankEntry) => number | null | undefined,
  opts?: { primary?: boolean; muted?: boolean; hiddenMd?: boolean },
): DataTableColumn<OpenRouterRankEntry> {
  const col = opts?.primary ? mobilePrimaryCol : rightCol;
  return col(
    id,
    header,
    (item) => (
      <span className={`ui-mono-value ${opts?.muted ? "font-normal text-text-secondary" : "font-semibold"}`}>
        {tokenText(get(item))}
      </span>
    ),
    opts?.hiddenMd ? { hiddenMd: true } : undefined,
  );
}

function buildOpenRouterBodyColumns(t: (key: TranslationKey) => string): DataTableColumn<OpenRouterRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
      "45%",
    ),
    tokenCol("totalTokens", t("totalTokens"), (item) => item.totalTokens, { primary: true }),
    tokenCol("inputTokens", t("inputTokens"), (item) => item.promptTokens, { hiddenMd: true }),
    tokenCol("outputTokens", t("outputTokens"), (item) => item.completionTokens, { hiddenMd: true }),
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
  const modelColumns = useRankedColumns(buildOpenRouterBodyColumns);

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
