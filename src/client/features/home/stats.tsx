import { memo } from "react";
import { useTranslation } from "@/client/providers";
import { Card, CardContent } from "@/client/components/ui";
import { PageSection } from "@/client/components/layout";

/** One ranked bar row: a display label, the numeric value, and its preformatted label. */
export interface HomeBarStat {
  label: string;
  value: number;
  valueLabel: string;
}

/** Ranked stat cards: open-source downloads and hallucination accuracy. */
export const StatisticsSection = memo(function StatisticsSection({
  downloadStats,
  hallucinationStats,
}: {
  downloadStats: HomeBarStat[];
  hallucinationStats: HomeBarStat[];
}) {
  const { t } = useTranslation();
  return (
    <PageSection title={t("statistics")}>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <RankedStatCard title={t("openSourceDownloadsStats")} source={t("huggingFaceSource")} rows={downloadStats} />
        <RankedStatCard title={t("hallucinationStats")} source={t("hallucinationSource")} rows={hallucinationStats} />
      </div>
    </PageSection>
  );
});

const RankedStatCard = memo(function RankedStatCard({
  title,
  source,
  rows,
}: {
  title: string;
  source: string;
  rows: HomeBarStat[];
}) {
  const { t } = useTranslation();
  return (
    <Card>
      <CardContent padding="md">
        <p className="ui-card-title mb-1">{title}</p>
        <p className="ui-caption mb-4">{source}</p>
        {rows.length === 0 ? (
          <p className="ui-body-secondary">{t("notAvailable")}</p>
        ) : (
          <div className="flex flex-col gap-1">
            {rows.map((row, i) => (
              <div key={`${row.label}#${i + 1}`} className="flex items-center gap-3 h-8">
                <span className="text-xs font-medium text-text-tertiary w-6 text-center shrink-0 tabular-nums">
                  {i + 1}
                </span>
                <span className="text-sm truncate min-w-0 flex-1">{row.label}</span>
                <span className="ui-mono-value shrink-0">{row.valueLabel}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
