import { TrendingDown, TrendingUp } from "lucide-react";
import { useSuspenseAgentRankingsState } from "@/client/api/api-queries";
import type { AgentRankEntry } from "@/shared/types";
import { RankedTableView, modelNameCol } from "@/client/components/data/table";
import { PartialNotice } from "@/client/components/feedback";
import { cn } from "@/client/utils/cn";
import { rightCol, trendClass, type DataTableColumn } from "@/client/components/data/table/table-columns";
import type { useTranslation } from "@/client/providers";

function buildAgentColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<AgentRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
    ),
    {
      id: "score",
      header: t("score"),
      align: "right",
      cell: (item) => {
        if (item.score == null || !Number.isFinite(item.score)) {
          return <span className="ui-mono-value font-semibold">{t("notAvailable")}</span>;
        }
        const up = item.score >= 0;
        const TrendIcon = up ? TrendingUp : TrendingDown;
        const halfWidth =
          item.ciLower != null && item.ciUpper != null && Number.isFinite(item.ciLower) && Number.isFinite(item.ciUpper)
            ? ((item.ciUpper - item.ciLower) / 2) * 100
            : null;
        return (
          <span className="ui-mono-value inline-flex flex-col items-end leading-tight">
            <span className={cn("inline-flex items-center gap-1 font-semibold", trendClass(item.score, true))}>
              <TrendIcon size={12} aria-hidden />
              {Math.abs(item.score * 100).toFixed(2)}%
            </span>
            {halfWidth != null && (
              <span className="text-xs font-normal text-text-secondary">±{halfWidth.toFixed(2)}%</span>
            )}
          </span>
        );
      },
    },
    rightCol("creator", t("provider"), (item) => <span className="text-sm">{item.creator}</span>, { hiddenMd: true }),
    rightCol("license", t("license"), (item) => <span className="text-sm">{item.license ?? t("notAvailable")}</span>, {
      hiddenMd: true,
    }),
  ];
}

const getAgentRowId = (entry: AgentRankEntry) => `${entry.rank}|${entry.id}`;
const getAgentSearchFields = (entry: AgentRankEntry) => [entry.name, entry.id, entry.creator];

export function AgentRankingsView() {
  const { items, partial } = useSuspenseAgentRankingsState();
  return (
    <>
      {partial && <PartialNotice />}
      <RankedTableView
        rows={items}
        getRowId={getAgentRowId}
        getSearchFields={getAgentSearchFields}
        buildBodyColumns={buildAgentColumns}
      />
    </>
  );
}
