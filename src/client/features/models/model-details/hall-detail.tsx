"use client";
import type { ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";
import { formatIndex, formatPercent } from "@/client/utils/format";
import { normalizeModelKey } from "@/shared/utils";
import { DetailSection, StatGrid } from "@/client/components/ui/grids";
import { InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { NotFound } from "@/client/components/feedback";
import { useSuspenseArtificialRankings, useSuspenseHallucinationRankings } from "@/client/api/queries";
import { ModelDetailContent } from "@/client/features/models/model-details/aa-detail";
import { DetailShell, findModel } from "@/client/features/models/model-details/detail-views";

function HallDetailContent({
  model,
  aaModel,
}: {
  model: HallucinationRankingEntry;
  aaModel?: ArtificialAnalysisModel;
}) {
  const { t } = useTranslation();
  const hallStats: [TranslationKey, ReactNode][] = [
    ["omniscienceIndex", formatIndex(model.omniscienceIndex)],
    ["accuracy", formatPercent(t, model.accuracy)],
    ["hallucinationRate", formatPercent(t, model.hallucinationRate)],
    ["attemptRate", formatPercent(t, model.attemptRate)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <StatGrid columns={4}>
        {hallStats.map(([labelKey, value]) => (
          <StatCard key={labelKey} label={t(labelKey)} value={value} />
        ))}
      </StatGrid>
      <InfoCard title={t("modelInfo")}>
        <InfoRow label={t("modelNameOrId")} value={model.model} />
        <InfoRow label={t("slug")} value={model.slug} />
        {aaModel?.model_creators?.name && <InfoRow label={t("creator")} value={aaModel.model_creators.name} />}
        {aaModel?.release_date && <InfoRow label={t("releaseDate")} value={aaModel.release_date} />}
      </InfoCard>
      {aaModel && (
        <DetailSection title={t("modelDetail")}>
          <ModelDetailContent model={aaModel} />
        </DetailSection>
      )}
    </div>
  );
}

export function HallDetail({ decodedId }: { decodedId: string }) {
  const aaData = useSuspenseArtificialRankings();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const entry = findModel(hallucinationRankings, decodedId, "id", "slug");
  const aaModel =
    findModel(aaData, decodedId, "id", "slug") ??
    (entry
      ? (() => {
          const want = normalizeModelKey(entry.model);
          const slugWant = normalizeModelKey(entry.slug);
          const candidates = aaData.filter((m) => {
            const keys = [m.name, m.short_name, m.slug].filter((v): v is string => !!v).map(normalizeModelKey);
            return keys.includes(want) || keys.includes(slugWant);
          });
          return candidates.length === 1 ? candidates[0] : undefined;
        })()
      : undefined);
  if (!entry) return <NotFound />;
  return (
    <DetailShell source="hall" title={entry.model}>
      <HallDetailContent model={entry} aaModel={aaModel} />
    </DetailShell>
  );
}
