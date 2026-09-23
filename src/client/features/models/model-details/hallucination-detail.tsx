import { useMemo, type ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel, HallucinationRankingEntry } from "@/shared/types";
import { formatIndex, formatPercent } from "@/client/utils/format";
import { normalizeModelKey } from "@/shared/utils";
import { StatGrid } from "@/client/components/ui/grids";
import { PageSection } from "@/client/components/layout";
import { InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { NotFound } from "@/client/components/feedback";
import { useSuspenseArtificialRankings, useSuspenseHallucinationRankings } from "@/client/api/api-queries";
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
    ["accuracy", formatPercent(model.accuracy, t)],
    ["hallucinationRate", formatPercent(model.hallucinationRate, t)],
    ["attemptRate", formatPercent(model.attemptRate, t)],
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
        <PageSection title={t("modelDetail")}>
          <ModelDetailContent model={aaModel} />
        </PageSection>
      )}
    </div>
  );
}

function indexAaModels(models: ArtificialAnalysisModel[]): Map<string, ArtificialAnalysisModel[]> {
  const index = new Map<string, ArtificialAnalysisModel[]>();
  for (const model of models) {
    for (const value of [model.name, model.short_name, model.slug]) {
      if (!value) continue;
      const key = normalizeModelKey(value);
      const bucket = index.get(key);
      if (bucket) bucket.push(model);
      else index.set(key, [model]);
    }
  }
  return index;
}

function findAaModelForHall(
  aaIndex: Map<string, ArtificialAnalysisModel[]>,
  entry: HallucinationRankingEntry,
): ArtificialAnalysisModel | undefined {
  const candidates = new Set<ArtificialAnalysisModel>();
  for (const value of [entry.model, entry.slug]) {
    if (!value) continue;
    for (const model of aaIndex.get(normalizeModelKey(value)) ?? []) candidates.add(model);
  }
  return candidates.size === 1 ? candidates.values().next().value : undefined;
}

export function HallDetail({ decodedId }: { decodedId: string }) {
  const aaData = useSuspenseArtificialRankings();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const aaIndex = useMemo(() => indexAaModels(aaData), [aaData]);
  const entry = findModel(hallucinationRankings, decodedId, "id", "slug");
  const aaModel =
    findModel(aaData, decodedId, "id", "slug") ?? (entry ? findAaModelForHall(aaIndex, entry) : undefined);
  if (!entry) return <NotFound />;
  return (
    <DetailShell source="hall" title={entry.model}>
      <HallDetailContent model={entry} aaModel={aaModel} />
    </DetailShell>
  );
}
