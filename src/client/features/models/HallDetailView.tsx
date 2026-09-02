import { useTranslation } from "@/client/providers";
import { NotFound } from "@/client/components/shared";
import { StatCard, InfoCard, InfoRow, DetailLayout, DetailSection, StatGrid } from "@/client/components/ui";
import { useSuspenseArtificialRankings, useSuspenseHallucinationRankings } from "@/client/api/queries";
import { findModel, formatIndex, formatPercent } from "@/client/utils";
import { ModelDetailContent } from "./ModelDetailContent";
import { DetailShell } from "./detailViews";
import type { HallucinationRankingEntry, ArtificialAnalysisModel } from "@/shared/types";

function HallDetailContent({
  model,
  aaModel,
}: {
  model: HallucinationRankingEntry;
  aaModel?: ArtificialAnalysisModel;
}) {
  const { t } = useTranslation();
  return (
    <DetailLayout>
      <StatGrid columns={4}>
        <StatCard label={t("omniscienceIndex")} value={formatIndex(model.omniscienceIndex)} />
        <StatCard label={t("accuracy")} value={formatPercent(t, model.accuracy)} />
        <StatCard label={t("hallucinationRate")} value={formatPercent(t, model.hallucinationRate)} />
        <StatCard label={t("attemptRate")} value={formatPercent(t, model.attemptRate)} />
      </StatGrid>
      <InfoCard title={t("modelInfo")}>
        <InfoRow compact label={t("modelNameOrId")} value={model.model} />
        <InfoRow compact label={t("slug")} value={model.slug} />
        {aaModel?.model_creators?.name && <InfoRow compact label={t("creator")} value={aaModel.model_creators.name} />}
        {aaModel?.release_date && <InfoRow compact label={t("releaseDate")} value={aaModel.release_date} />}
      </InfoCard>
      {aaModel && (
        <DetailSection title={t("modelDetail")}>
          <ModelDetailContent model={aaModel} />
        </DetailSection>
      )}
    </DetailLayout>
  );
}

/** Hallucination benchmark detail; metrics are derived from the same Artificial Analysis dataset. */
export function HallDetail({ decodedId }: { decodedId: string }) {
  const { data: aaData } = useSuspenseArtificialRankings();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const entry = findModel(hallucinationRankings, decodedId, "id", "slug");
  const aaModel = findModel(aaData, decodedId, "id", "slug");
  if (!entry) return <NotFound />;
  return (
    <DetailShell source="hall" title={entry.model}>
      <HallDetailContent model={entry} aaModel={aaModel} />
    </DetailShell>
  );
}
