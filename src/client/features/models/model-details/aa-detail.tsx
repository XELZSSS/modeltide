import { useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import { MODALITY_KEYS, ABSOLUTE_SCORE_BENCHMARKS, type BenchmarkKey, type ModalityKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import {
  benchmarkLabel,
  formatBoolean,
  formatPricePerMillion,
  formatScore,
  formatTokens,
  orNA,
} from "@/client/utils/format";
import { computeBlendPrice, unclampedPercent } from "@/shared/utils";
import { getOutputSpeed } from "@/client/utils/model-utils";
import { resolveEffectivePricing, PRICE_LEGS } from "@/client/utils/pricing";
import { InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { PageSection } from "@/client/components/layout";
import { Badge, InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { createDetailView } from "./detail-views";
import { useSuspenseArtificialRankingsState } from "@/client/api/api-queries";

const MODALITY_STYLES: Record<ModalityKey, { className: string; labelKey: TranslationKey }> = {
  text: { className: "border-accent/30 bg-accent-light text-accent", labelKey: "modalityText" },
  image: { className: "border-info/30 bg-info-light text-info", labelKey: "modalityImage" },
  speech: { className: "border-success/30 bg-success-light text-success", labelKey: "modalitySpeech" },
  video: { className: "border-warning/30 bg-warning-light text-warning", labelKey: "modalityVideo" },
};

function titleCaseSizeClass(s: string): string {
  return s.replace(/[-_]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function ModalitySection({
  label,
  prefix,
  model,
  t,
}: {
  label: string;
  prefix: "input" | "output";
  model: ArtificialAnalysisModel;
  t: TFunction;
}) {
  return (
    <div>
      <div className="ui-caption font-medium mb-2.5">{label}</div>
      <div className="flex gap-2 flex-wrap">
        {MODALITY_KEYS.map((key) => {
          const style = MODALITY_STYLES[key];
          return (
            model[`${prefix}_modality_${key}` as keyof ArtificialAnalysisModel] && (
              <Badge key={key} className={`px-2.5 py-1 normal-case tracking-normal ${style.className}`}>
                {t(style.labelKey)}
              </Badge>
            )
          );
        })}
      </div>
    </div>
  );
}

export function ModelDetailContent({
  model,
  showBenchmarks = true,
}: {
  model: ArtificialAnalysisModel;
  showBenchmarks?: boolean;
}) {
  const { t } = useTranslation();
  const pricing = useMemo(() => resolveEffectivePricing(model.pricing), [model.pricing]);
  const blended = useMemo(() => computeBlendPrice(pricing), [pricing]);
  const cacheWrite = PRICE_LEGS.cacheWritePrice(pricing);
  const hasAnyModality = MODALITY_KEYS.some(
    (key) =>
      model[`input_modality_${key}` as keyof ArtificialAnalysisModel] ||
      model[`output_modality_${key}` as keyof ArtificialAnalysisModel],
  );
  const scoreStats: [TranslationKey, number | null | undefined][] = [
    ["intelligenceIndex", model.intelligence_index],
    ["coding", model.coding_index],
    ["agentic", model.agentic_index],
    ["outputSpeed", getOutputSpeed(model)],
  ];
  return (
    <div className="flex flex-col gap-4">
      <StatGrid columns={4}>
        {scoreStats.map(([labelKey, value]) => (
          <StatCard key={labelKey} label={t(labelKey)} value={formatScore(value, t)} />
        ))}
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow label={t("creator")} value={orNA(model.model_creators?.name, t)} />
          <InfoRow label={t("releaseDate")} value={orNA(model.release_date, t)} />
          <InfoRow label={t("openWeights")} value={formatBoolean(model.is_open_weights, t)} />
          <InfoRow label={t("reasoning")} value={formatBoolean(model.is_reasoning === true, t)} />
          {model.parameters != null && <InfoRow label={t("parameters")} value={formatTokens(model.parameters, t)} />}
          {model.size_class && <InfoRow label={t("sizeClass")} value={titleCaseSizeClass(model.size_class)} />}
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow label={t("promptPrice")} value={formatPricePerMillion(PRICE_LEGS.promptPrice(pricing), t)} />
          <InfoRow label={t("completionPrice")} value={formatPricePerMillion(PRICE_LEGS.completionPrice(pricing), t)} />
          <InfoRow label={t("cacheHitPrice")} value={formatPricePerMillion(PRICE_LEGS.cacheHitPrice(pricing), t)} />
          {cacheWrite != null && <InfoRow label={t("cacheWritePrice")} value={formatPricePerMillion(cacheWrite, t)} />}
          <InfoRow label={t("blendedPrice")} value={formatPricePerMillion(blended, t)} />
        </InfoCard>
      </InfoGrid>
      {showBenchmarks && model.benchmarks && Object.values(model.benchmarks).some((v) => v != null) && (
        <PageSection title={t("benchmarks")}>
          <StatGrid columns={4}>
            {Object.entries(model.benchmarks).map(([key, value]) => {
              const display = ABSOLUTE_SCORE_BENCHMARKS.has(key as BenchmarkKey)
                ? typeof value === "number" && Number.isFinite(value)
                  ? value
                  : null
                : unclampedPercent(value);
              return display == null ? null : (
                <StatCard key={key} label={benchmarkLabel(key, t)} value={formatScore(display, t)} />
              );
            })}
          </StatGrid>
        </PageSection>
      )}
      {hasAnyModality && (
        <PageSection title={t("modalities")}>
          <div className="flex flex-col gap-4 md:flex-row md:gap-12">
            <ModalitySection label={t("inputModality")} prefix="input" model={model} t={t} />
            <ModalitySection label={t("outputModality")} prefix="output" model={model} t={t} />
          </div>
        </PageSection>
      )}
    </div>
  );
}

export const AADetail = createDetailView(
  () => {
    const { items, partial } = useSuspenseArtificialRankingsState();
    return { data: items, partial };
  },
  "aa",
  ModelDetailContent,
  (m) => m.name,
  "id",
  "slug",
);
