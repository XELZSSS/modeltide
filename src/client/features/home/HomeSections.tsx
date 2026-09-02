import { memo } from "react";
import { useTranslation } from "@/client/providers";
import { StatCard, CardGrid, Card, CardContent, Dot } from "@/client/components/ui";
import { PageSection } from "@/client/components/layout";
import { formatDollar, formatSpeed } from "@/client/utils";
import type { TextToImageModel } from "@/shared/types";
import type { HomeKpi, HomeProviderStat } from "./useHomeStats";

function formatRatingInterval(entry: TextToImageModel): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${entry.eloLower.toFixed(0)}–${entry.eloUpper.toFixed(0)})`;
}

export const KpiStrip = memo(function KpiStrip({ kpis }: { kpis: HomeKpi[] }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4">
      {/* KPI order is fixed, but label keys are stable while positions are not. */}
      {kpis.map((kpi) => (
        <StatCard key={kpi.label} icon={kpi.Icon} label={kpi.label} value={kpi.value} />
      ))}
    </div>
  );
});

export const ProviderSpeedCard = memo(function ProviderSpeedCard({
  providerStats,
}: {
  providerStats: HomeProviderStat[];
}) {
  const { t } = useTranslation();
  return (
    <Card className="h-full">
      <CardContent padding="md" className="flex flex-col h-full">
        <p className="text-[11px] font-medium text-text-tertiary mb-3">{t("providerSpeed")}</p>
        <div className="flex flex-col gap-3 flex-1 justify-between">
          {providerStats.slice(0, 6).map((p) => (
            <div key={p.name} className="flex items-center justify-between min-w-0">
              <div className="flex items-center gap-2 min-w-0">
                <Dot color={p.color} />
                <span className="text-sm sm:text-base font-medium truncate">{p.name}</span>
              </div>
              <span className="text-sm sm:text-base font-semibold font-mono ml-3 shrink-0">
                {formatSpeed(t, p.avgSpeed)} {t("tokensPerSecond")}
              </span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
});

const TextToImageCard = memo(function TextToImageCard({ entry }: { entry: TextToImageModel }) {
  const { t, lang } = useTranslation();
  const locale = lang === "zh" ? "zh-CN" : "en-US";
  return (
    <Card>
      <div className="flex flex-col gap-2.5 p-4 w-full">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium truncate">{entry.name}</span>
            {entry.creatorName && (
              <span className="text-xs text-text-secondary truncate shrink-0">({entry.creatorName})</span>
            )}
          </div>
          <span className="text-xs font-medium text-text-tertiary font-mono shrink-0">#{entry.rank}</span>
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary">
          <span>
            {t("elo")}:{" "}
            <strong className="text-text-primary font-semibold">
              {entry.elo != null ? `${entry.elo.toFixed(0)}${formatRatingInterval(entry)}` : t("notAvailable")}
            </strong>
          </span>
          <span>
            {t("votes")}:{" "}
            <strong className="text-text-primary font-semibold">
              {entry.appearances != null ? entry.appearances.toLocaleString(locale) : t("notAvailable")}
            </strong>
          </span>
          {entry.pricePer1kImages != null ? (
            <span>
              {t("price")}:{" "}
              <strong className="text-text-primary font-semibold">
                {formatDollar(entry.pricePer1kImages, t)}
                {t("per1kImages")}
              </strong>
            </span>
          ) : null}
          {entry.winRate != null ? (
            <span>
              {t("winRateShort")}:{" "}
              <strong className="text-text-primary font-semibold">{(entry.winRate * 100).toFixed(1)}%</strong>
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  );
});

export const TextToImageSection = memo(function TextToImageSection({ models }: { models: TextToImageModel[] }) {
  const { t } = useTranslation();
  if (models.length === 0) return null;
  return (
    <PageSection title={t("textToImage")} description={t("artificialSource")}>
      <CardGrid cols={4} gap={3}>
        {models.slice(0, 8).map((entry) => (
          <TextToImageCard key={entry.id} entry={entry} />
        ))}
      </CardGrid>
    </PageSection>
  );
});
