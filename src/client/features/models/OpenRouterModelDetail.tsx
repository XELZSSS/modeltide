import { useTranslation } from "@/client/providers";
import { Badge } from "@/client/components/ui";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryLabel, formatPricePerMillion, formatShortNumber, formatTrend } from "@/client/utils";
import { DetailLayout, StatGrid, InfoGrid, InfoCard, InfoRow, StatCard } from "@/client/components/ui";

// Prices are stored per token; convert to per-million-token for display consistency.
function toPerMillion(price: number | null | undefined): number | undefined {
  return typeof price === "number" && Number.isFinite(price) ? price * 1_000_000 : undefined;
}

/** Detail view for an OpenRouter ranking entry: stats, pricing, recommendation and badges. */
export function OpenRouterModelDetail({ model }: { model: OpenRouterRankEntry }) {
  const { t } = useTranslation();
  // Only surface meaningful variants; "standard"/"free" are the defaults and add noise.
  const showVariantBadge = !!model.variant && model.variant !== "standard" && model.variant !== "free";
  return (
    <DetailLayout>
      <StatGrid columns={4}>
        <StatCard label={t("creator")} value={model.creator} />
        <StatCard label={t("inputTokens")} value={formatShortNumber(model.promptTokens ?? 0)} />
        <StatCard label={t("outputTokens")} value={formatShortNumber(model.completionTokens ?? 0)} />
        {model.reasoningTokens ? (
          <StatCard label={t("reasoningTokens")} value={formatShortNumber(model.reasoningTokens)} />
        ) : (
          <StatCard label={t("category")} value={categoryLabel(model.category, t)} />
        )}
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow
            compact
            label={t("apiModelId")}
            value={<code className="font-mono text-xs bg-bg-secondary px-1 rounded">{model.id}</code>}
          />
          <InfoRow compact label={t("category")} value={categoryLabel(model.category, t)} />
          <InfoRow compact label={t("trend")} value={formatTrend(model.change, t)} />
          <InfoRow compact label={t("totalTokens")} value={formatShortNumber(model.totalTokens ?? 0)} />
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow
            compact
            label={t("cacheHitPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.input_cache_read), t)}
          />
          <InfoRow
            compact
            label={t("promptPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.prompt), t)}
          />
          <InfoRow
            compact
            label={t("completionPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.completion), t)}
          />
        </InfoCard>
      </InfoGrid>
      {(showVariantBadge || model.isFree) && (
        <div className="flex flex-wrap gap-1.5">
          {showVariantBadge && <Badge>{model.variant}</Badge>}
          {model.isFree && <Badge className="text-success">{t("free")}</Badge>}
        </div>
      )}
    </DetailLayout>
  );
}
