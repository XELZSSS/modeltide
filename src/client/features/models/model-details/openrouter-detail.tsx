import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryLabel, formatPricePerMillion, formatShortNumber, formatTrend } from "@/client/utils/format";
import { InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { Badge, InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { useSuspenseOpenRouterRankings } from "@/client/api/api-queries";
import { isPartialPayload, unwrapList } from "@/client/api/payload-normalize";
import { PRICE_LEGS, type PriceLegId } from "@/client/utils/pricing";
import { createDetailView } from "./detail-views";

const PRICE_ROW_LEGS = ["cacheHitPrice", "promptPrice", "completionPrice"] as const satisfies readonly PriceLegId[];

export function OpenRouterModelDetail({ model }: { model: OpenRouterRankEntry }) {
  const { t } = useTranslation();
  const showVariantBadge = !!model.variant && model.variant !== "standard" && model.variant !== "free";
  const pricing = model.pricing;
  const priceRows: [TranslationKey, number | null | undefined][] = PRICE_ROW_LEGS.map((id) => [
    id,
    pricing ? PRICE_LEGS[id](pricing) : undefined,
  ]);
  const cacheWrite = pricing ? PRICE_LEGS.cacheWritePrice(pricing) : null;
  const tokenStats: [TranslationKey, string][] = [
    ["inputTokens", model.promptTokens != null ? formatShortNumber(model.promptTokens) : t("notAvailable")],
    ["outputTokens", model.completionTokens != null ? formatShortNumber(model.completionTokens) : t("notAvailable")],
  ];
  return (
    <div className="flex flex-col gap-4">
      <StatGrid columns={4}>
        <StatCard label={t("creator")} value={model.creator} />
        {tokenStats.map(([labelKey, value]) => (
          <StatCard key={labelKey} label={t(labelKey)} value={value} />
        ))}
        {model.reasoningTokens != null ? (
          <StatCard label={t("reasoningTokens")} value={formatShortNumber(model.reasoningTokens)} />
        ) : (
          <StatCard label={t("category")} value={categoryLabel(model.category, t)} />
        )}
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow
            label={t("apiModelId")}
            value={<code className="font-mono text-xs bg-bg-secondary px-1.5 py-0.5">{model.id}</code>}
          />
          <InfoRow label={t("category")} value={categoryLabel(model.category, t)} />
          <InfoRow label={t("trend")} value={formatTrend(model.change, t)} />
          <InfoRow
            label={t("totalTokens")}
            value={model.totalTokens != null ? formatShortNumber(model.totalTokens) : t("notAvailable")}
          />
          {model.cachedTokens != null ? (
            <InfoRow label={t("cachedTokens")} value={formatShortNumber(model.cachedTokens)} />
          ) : null}
          {model.toolCalls != null ? (
            <InfoRow label={t("toolCalls")} value={formatShortNumber(model.toolCalls)} />
          ) : null}
        </InfoCard>
        <InfoCard title={t("pricing")}>
          {priceRows.map(([labelKey, value]) => (
            <InfoRow key={labelKey} label={t(labelKey)} value={formatPricePerMillion(value, t)} />
          ))}
          {cacheWrite != null && <InfoRow label={t("cacheWritePrice")} value={formatPricePerMillion(cacheWrite, t)} />}
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
    return {
      data: unwrapList<OpenRouterRankEntry>(data, "openRouterRankings"),
      partial: isPartialPayload(data),
    };
  },
  "or",
  OpenRouterModelDetail,
  (m) => m.name,
  "id",
);
