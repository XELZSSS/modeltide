import type { DataTableColumn } from "@/client/components/data";
import { RankingNameCell, RightAlignedText, rightCol, textCol } from "@/client/components/data";
import { formatShortNumber, formatTrend, cn } from "@/client/utils";
import type { OpenRouterRankEntry } from "@/shared/types";
import type { TranslationKey } from "@/shared/i18n";

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
