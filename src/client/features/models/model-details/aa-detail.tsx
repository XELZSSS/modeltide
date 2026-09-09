"use client";
import { useMemo } from "react";
import { useTranslation } from "@/client/providers";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import type { BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import {
  benchmarkLabel,
  formatBoolean,
  formatPricePerMillion,
  formatScore,
  formatTokens,
  orNA,
} from "@/client/utils/format";
import { normalizePercent } from "@/shared/utils";
import { getOutputSpeed } from "@/client/utils/cost-estimator";
import { resolveBlendedPrice, resolveEffectivePricing } from "@/client/utils/pricing-merge";
import { DetailLayout, DetailSection, InfoGrid, StatGrid } from "@/client/components/ui/grids";
import { InfoCard, InfoRow } from "@/client/components/ui/primitives";
import { StatCard } from "@/client/components/ui/stat-card";
import { useOfficialPricing } from "@/client/features/pricing/official";
import { createDetailView } from "./detail-views";
import { useSuspenseArtificialRankings } from "@/client/api/queries";

const MODALITIES = [
  {
    key: "text",
    className: "border-accent/30 bg-accent-light text-accent",
    labelKey: "modalityText",
  },
  {
    key: "image",
    className: "border-info/30 bg-info-light text-info",
    labelKey: "modalityImage",
  },
  {
    key: "speech",
    className: "border-success/30 bg-success-light text-success",
    labelKey: "modalitySpeech",
  },
  {
    key: "video",
    className: "border-warning/30 bg-warning-light text-warning",
    labelKey: "modalityVideo",
  },
] as const satisfies readonly { key: string; className: string; labelKey: TranslationKey }[];

const ABSOLUTE_SCORE_BENCHMARKS = new Set<BenchmarkKey>(["gdpval"]);

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
        {MODALITIES.map(
          (m) =>
            model[`${prefix}_modality_${m.key}` as keyof ArtificialAnalysisModel] && (
              <span key={m.key} className={`px-2.5 py-1 text-xs font-medium rounded-none border ${m.className}`}>
                {t(m.labelKey)}
              </span>
            ),
        )}
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
  const { getOfficial } = useOfficialPricing();
  const official = useMemo(() => getOfficial?.(model), [getOfficial, model]);
  const pricing = useMemo(() => resolveEffectivePricing(model.pricing, official), [model.pricing, official]);
  const blended = useMemo(() => resolveBlendedPrice(model, official), [model, official]);
  const hasAnyModality = MODALITIES.some(
    (m) =>
      model[`input_modality_${m.key}` as keyof ArtificialAnalysisModel] ||
      model[`output_modality_${m.key}` as keyof ArtificialAnalysisModel],
  );
  const scoreStats: [TranslationKey, number | null | undefined][] = [
    ["intelligenceIndex", model.intelligence_index],
    ["coding", model.coding_index],
    ["agentic", model.agentic_index],
    ["outputSpeed", getOutputSpeed(model)],
  ];
  return (
    <DetailLayout>
      <StatGrid columns={4}>
        {scoreStats.map(([labelKey, value]) => (
          <StatCard key={labelKey} label={t(labelKey)} value={formatScore(t, value)} />
        ))}
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow label={t("creator")} value={orNA(model.model_creators?.name, t)} />
          <InfoRow label={t("releaseDate")} value={orNA(model.release_date, t)} />
          <InfoRow label={t("openWeights")} value={formatBoolean(t, model.is_open_weights)} />
          <InfoRow label={t("reasoning")} value={formatBoolean(t, model.is_reasoning === true)} />
          {model.parameters != null && <InfoRow label={t("parameters")} value={formatTokens(model.parameters, t)} />}
          {model.size_class && <InfoRow label={t("sizeClass")} value={titleCaseSizeClass(model.size_class)} />}
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow label={t("promptPrice")} value={formatPricePerMillion(pricing.input, t)} />
          <InfoRow label={t("completionPrice")} value={formatPricePerMillion(pricing.output, t)} />
          <InfoRow label={t("cacheHitPrice")} value={formatPricePerMillion(pricing.cacheHit, t)} />
          {pricing.cacheWrite != null && (
            <InfoRow label={t("cacheWritePrice")} value={formatPricePerMillion(pricing.cacheWrite, t)} />
          )}
          <InfoRow label={t("blendedPrice")} value={formatPricePerMillion(blended, t)} />
        </InfoCard>
      </InfoGrid>
      {showBenchmarks && model.benchmarks && Object.values(model.benchmarks).some((v) => v != null) && (
        <DetailSection title={t("benchmarks")}>
          <StatGrid columns={4}>
            {Object.entries(model.benchmarks).map(([key, value]) => {
              const display = ABSOLUTE_SCORE_BENCHMARKS.has(key as BenchmarkKey)
                ? typeof value === "number" && Number.isFinite(value)
                  ? value
                  : null
                : normalizePercent(value);
              return display == null ? null : (
                <StatCard key={key} label={benchmarkLabel(key, t)} value={formatScore(t, display)} />
              );
            })}
          </StatGrid>
        </DetailSection>
      )}
      {hasAnyModality && (
        <DetailSection title={t("modalities")}>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <ModalitySection label={t("inputModality")} prefix="input" model={model} t={t} />
            <ModalitySection label={t("outputModality")} prefix="output" model={model} t={t} />
          </div>
        </DetailSection>
      )}
    </DetailLayout>
  );
}

export const AADetail = createDetailView(
  useSuspenseArtificialRankings,
  "aa",
  ModelDetailContent,
  (m) => m.name,
  "id",
  "slug",
);
