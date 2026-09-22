import { memo } from "react";
import { useTranslation } from "@/client/providers";
import type { TextToImageModel } from "@/shared/types";
import { formatDollar, formatSpeed } from "@/client/utils/format";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";
import { StatCard } from "@/client/components/ui/stat-card";
import { LabeledDot } from "@/client/components/ui/primitives";
import { StatGrid } from "@/client/components/ui/grids";
import { PageSection } from "@/client/components/layout";
import type { HomeKpi, HomeProviderStat } from "./use-home-stats";

function formatRatingInterval(entry: TextToImageModel): string {
  if (entry.eloUpper == null || entry.eloLower == null) return "";
  return ` (${entry.eloLower.toFixed(0)}–${entry.eloUpper.toFixed(0)})`;
}

function T2IMetric({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span>
      {label}: <strong className="text-text-primary font-semibold">{children}</strong>
    </span>
  );
}

export const KpiStrip = memo(function KpiStrip({ kpis }: { kpis: HomeKpi[] }) {
  return (
    <StatGrid columns={4}>
      {kpis.map((kpi) => (
        <StatCard key={kpi.id} icon={kpi.Icon} label={kpi.label} value={kpi.value} />
      ))}
    </StatGrid>
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
      <CardContent className="flex flex-col h-full">
        <CardHeader title={t("providerSpeed")} subtitle={t("artificialSource")} />
        <div className="flex flex-col gap-3 flex-1 justify-between">
          {providerStats.slice(0, 6).map((p) => (
            <div key={p.name} className="flex items-center justify-between gap-3 min-w-0">
              <LabeledDot color={p.color} className="flex-1">
                {p.name}
              </LabeledDot>
              <span className="text-sm font-semibold font-mono ml-3 shrink-0">
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
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent className="flex flex-col gap-3 w-full">
        <div className="flex items-center gap-2 min-w-0">
          <span className="ui-card-title truncate">{entry.name}</span>
          {entry.creatorName && <span className="ui-caption truncate shrink-0">({entry.creatorName})</span>}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1.5 ui-caption">
          <T2IMetric label={t("elo")}>
            {entry.elo != null ? `${entry.elo.toFixed(0)}${formatRatingInterval(entry)}` : t("notAvailable")}
          </T2IMetric>
          {entry.pricePer1kImages != null ? (
            <T2IMetric label={t("price")}>
              {formatDollar(entry.pricePer1kImages, t)}
              {t("per1kImages")}
            </T2IMetric>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
});

export const TextToImageSection = memo(function TextToImageSection({ models }: { models: TextToImageModel[] }) {
  const { t } = useTranslation();
  if (models.length === 0) return null;
  return (
    <PageSection title={t("textToImage")} description={t("artificialSource")}>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {models.slice(0, 8).map((entry) => (
          <TextToImageCard key={entry.id} entry={entry} />
        ))}
      </div>
    </PageSection>
  );
});
