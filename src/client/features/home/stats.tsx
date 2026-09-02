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

/** Two ranked stat cards: open-source download counts and hallucination accuracy. */
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
        <p className="text-sm sm:text-base font-semibold mb-1">{title}</p>
        <p className="text-xs text-text-secondary mb-3">{source}</p>
        {rows.length === 0 ? (
          <p className="text-sm text-text-secondary">{t("notAvailable")}</p>
        ) : (
          <div className="flex flex-col gap-2">
            {/* Rank position is stable here (rows are pre-sorted); label carries identity. */}
            {rows.map((row, i) => (
              <div key={`${row.label}#${i + 1}`} className="flex items-center gap-3 h-7">
                <span className="text-xs sm:text-sm font-medium text-text-tertiary w-6 text-center shrink-0">
                  {i + 1}
                </span>
                <span className="text-sm truncate min-w-0 flex-1">{row.label}</span>
                <span className="text-sm font-semibold font-mono shrink-0">{row.valueLabel}</span>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
});
