"use client";
import { TrendingDown, TrendingUp } from "lucide-react";
import { useSuspenseAgentRankings } from "@/client/api/queries";
import type { AgentRankEntry } from "@/shared/types";
import { RankedTableView, modelNameCol } from "@/client/features/rankings/rank-shared";
import { cn } from "@/client/utils/cn";
import type { DataTableColumn } from "@/client/components/data/columns";
import type { useTranslation } from "@/client/providers";

function trendClass(score: number): string {
  return score >= 0 ? "text-success" : "text-destructive";
}

function buildAgentColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<AgentRankEntry>[] {
  return [
    modelNameCol(
      t("model"),
      (item) => item.name,
      (item) => item.name,
    ),
    {
      id: "score",
      header: t("trend"),
      align: "right",
      // Mirrors the official board: Arena reports signal scores as ratios, the
      // site shows them ×100 as % with ▲/▼ by sign and the ± confidence band.
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
            <span className={cn("inline-flex items-center gap-1 font-semibold", trendClass(item.score))}>
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
    {
      id: "creator",
      header: t("provider"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{item.creator}</span>,
    },
    {
      id: "license",
      header: t("license"),
      align: "right",
      hiddenMd: true,
      cell: (item) => <span className="text-sm">{item.license ?? t("notAvailable")}</span>,
    },
  ];
}

const getAgentRowId = (entry: AgentRankEntry) => `${entry.rank}|${entry.id}`;
const getAgentSearchFields = (entry: AgentRankEntry) => [entry.name, entry.id, entry.creator];

export function AgentRankingsView() {
  const { data } = useSuspenseAgentRankings();
  const entries = Array.isArray((data as { entries?: unknown })?.entries)
    ? (data as { entries: AgentRankEntry[] }).entries
    : [];
  return (
    <RankedTableView
      rows={entries}
      getRowId={getAgentRowId}
      getSearchFields={getAgentSearchFields}
      buildBodyColumns={buildAgentColumns}
    />
  );
}
