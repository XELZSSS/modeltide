"use client";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryLabel, formatPricePerMillion, formatShortNumber, formatTrend } from "@/client/utils/format";
import { InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { Badge, InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { useSuspenseOpenRouterRankings } from "@/client/api/queries";
import { createDetailView } from "./detail-views";

export function OpenRouterModelDetail({ model }: { model: OpenRouterRankEntry }) {
  const { t } = useTranslation();
  const showVariantBadge = !!model.variant && model.variant !== "standard" && model.variant !== "free";
  const priceRows: [TranslationKey, number | null | undefined][] = [
    ["cacheHitPrice", model.pricing?.cacheHit],
    ["promptPrice", model.pricing?.input],
    ["completionPrice", model.pricing?.output],
  ];
  const tokenStats: [TranslationKey, string][] = [
    ["inputTokens", formatShortNumber(model.promptTokens ?? 0)],
    ["outputTokens", formatShortNumber(model.completionTokens ?? 0)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <StatGrid columns={4}>
        <StatCard label={t("creator")} value={model.creator} />
        {tokenStats.map(([labelKey, value]) => (
          <StatCard key={labelKey} label={t(labelKey)} value={value} />
        ))}
        {model.reasoningTokens ? (
          <StatCard label={t("reasoningTokens")} value={formatShortNumber(model.reasoningTokens)} />
        ) : (
          <StatCard label={t("category")} value={categoryLabel(model.category, t)} />
        )}
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow
            label={t("apiModelId")}
            value={<code className="font-mono text-xs bg-bg-secondary px-1.5 py-0.5 rounded-none">{model.id}</code>}
          />
          <InfoRow label={t("category")} value={categoryLabel(model.category, t)} />
          <InfoRow label={t("trend")} value={formatTrend(model.change, t)} />
          <InfoRow label={t("totalTokens")} value={formatShortNumber(model.totalTokens ?? 0)} />
          {model.cachedTokens ? (
            <InfoRow label={t("cachedTokens")} value={formatShortNumber(model.cachedTokens)} />
          ) : null}
          {model.toolCalls ? <InfoRow label={t("toolCalls")} value={formatShortNumber(model.toolCalls)} /> : null}
        </InfoCard>
        <InfoCard title={t("pricing")}>
          {priceRows.map(([labelKey, value]) => (
            <InfoRow key={labelKey} label={t(labelKey)} value={formatPricePerMillion(value, t)} />
          ))}
          {model.pricing?.cacheWrite != null && (
            <InfoRow label={t("cacheWritePrice")} value={formatPricePerMillion(model.pricing.cacheWrite, t)} />
          )}
        </InfoCard>
      </InfoGrid>
      {(showVariantBadge || model.isFree) && (
        <div className="flex flex-wrap gap-2">
          {showVariantBadge && <Badge>{model.variant}</Badge>}
          {model.isFree && <Badge className="text-success">{t("free")}</Badge>}
        </div>
      )}
    </div>
  );
}

export const OrDetail = createDetailView(
  () => {
    const { data } = useSuspenseOpenRouterRankings();
    if (data && !Array.isArray(data.tokenUsageRankings)) {
      throw new Error("openRouterRankings: invalid shape (tokenUsageRankings is not an array)");
    }
    return { data: data?.tokenUsageRankings };
  },
  "or",
  OpenRouterModelDetail,
  (m) => m.name,
  "id",
);
