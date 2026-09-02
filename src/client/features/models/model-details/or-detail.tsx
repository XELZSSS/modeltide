import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { OpenRouterRankEntry } from "@/shared/types";
import { categoryLabel, formatPricePerMillion, formatShortNumber, formatTrend } from "@/client/utils/format";
import { DetailLayout, InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { Badge, InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";

function toPerMillion(price: number | null | undefined): number | undefined {
  return typeof price === "number" && Number.isFinite(price) ? price * 1_000_000 : undefined;
}

export function OpenRouterModelDetail({ model }: { model: OpenRouterRankEntry }) {
  const { t } = useTranslation();
  const showVariantBadge = !!model.variant && model.variant !== "standard" && model.variant !== "free";
  const priceRows: [TranslationKey, number | null | undefined][] = [
    ["cacheHitPrice", toPerMillion(model.pricing?.cacheHit)],
    ["promptPrice", toPerMillion(model.pricing?.input)],
    ["completionPrice", toPerMillion(model.pricing?.output)],
  ];
  const tokenStats: [TranslationKey, string][] = [
    ["inputTokens", formatShortNumber(model.promptTokens ?? 0)],
    ["outputTokens", formatShortNumber(model.completionTokens ?? 0)],
  ];
  return (
    <DetailLayout>
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
        </InfoCard>
        <InfoCard title={t("pricing")}>
          {priceRows.map(([labelKey, value]) => (
            <InfoRow key={labelKey} label={t(labelKey)} value={formatPricePerMillion(value, t)} />
          ))}
        </InfoCard>
      </InfoGrid>
      {(showVariantBadge || model.isFree) && (
        <div className="flex flex-wrap gap-2">
          {showVariantBadge && <Badge>{model.variant}</Badge>}
          {model.isFree && <Badge className="text-success">{t("free")}</Badge>}
        </div>
      )}
    </DetailLayout>
  );
}
