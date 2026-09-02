import { useTranslation } from "@/client/providers";
import type { TFunction } from "@/shared/i18n";
import type { TranslationKey } from "@/shared/i18n";
import type { BenchmarkKey } from "@/shared/config";
import type { ArtificialAnalysisModel } from "@/shared/types";
import {
  formatBoolean,
  formatPricePerMillion,
  formatScore,
  formatTokens,
  benchmarkLabel,
  orNA,
  normalizePercent,
  getOutputSpeed,
} from "@/client/utils";
import { DetailLayout, DetailSection, StatGrid, InfoGrid, InfoCard, InfoRow, StatCard } from "@/client/components/ui";

// Tailwind classes colouring each input/output modality pill (cool hues only).
const MODALITY_STYLES = {
  text: "bg-sky-100 text-sky-800 dark:bg-sky-400/15 dark:text-sky-300",
  image: "bg-indigo-100 text-indigo-800 dark:bg-indigo-400/15 dark:text-indigo-300",
  speech: "bg-teal-100 text-teal-800 dark:bg-teal-400/15 dark:text-teal-300",
  video: "bg-violet-100 text-violet-800 dark:bg-violet-400/15 dark:text-violet-300",
} as const;

// Benchmarks reported as absolute scores rather than 0-1 accuracy fractions.
const ABSOLUTE_SCORE_BENCHMARKS = new Set<BenchmarkKey>(["gdpval"]);

const MODALITY_LABEL_KEYS = {
  text: "modalityText",
  image: "modalityImage",
  speech: "modalitySpeech",
  video: "modalityVideo",
} as const satisfies Record<string, TranslationKey>;

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
  // Model fields follow the naming `<prefix>_modality_<type>`, so the field name is derived from the prefix.
  const key = (m: string) => `${prefix}_modality_${m}` as keyof ArtificialAnalysisModel;
  return (
    <div>
      <div className="text-xs font-medium mb-2 text-text-secondary">{label}</div>
      <div className="flex gap-1.5 flex-wrap">
        {(["text", "image", "speech", "video"] as const).map((m) =>
          model[key(m)] ? (
            <span key={m} className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${MODALITY_STYLES[m]}`}>
              {t(MODALITY_LABEL_KEYS[m])}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/**
 * Full detail view for an AI model: key scores, metadata, pricing, benchmarks and modalities.
 * `showBenchmarks` hides the benchmarks card (used on list pages that already show scores).
 */
export function ModelDetailContent({
  model,
  showBenchmarks = true,
}: {
  model: ArtificialAnalysisModel;
  showBenchmarks?: boolean;
}) {
  const { t } = useTranslation();
  const modalityKeys = (["text", "image", "speech", "video"] as const).flatMap((m) => [
    `input_modality_${m}` as keyof ArtificialAnalysisModel,
    `output_modality_${m}` as keyof ArtificialAnalysisModel,
  ]);
  const hasAnyModality = modalityKeys.some((k) => model[k]);
  return (
    <DetailLayout>
      <StatGrid columns={4}>
        <StatCard label={t("intelligenceIndex")} value={formatScore(t, model.intelligence_index)} />
        <StatCard label={t("coding")} value={formatScore(t, model.coding_index)} />
        <StatCard label={t("agentic")} value={formatScore(t, model.agentic_index)} />
        <StatCard label={t("outputSpeed")} value={formatScore(t, getOutputSpeed(model))} />
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow compact label={t("creator")} value={orNA(model.model_creators?.name, t)} />
          <InfoRow compact label={t("releaseDate")} value={orNA(model.release_date, t)} />
          <InfoRow compact label={t("openWeights")} value={formatBoolean(t, model.is_open_weights)} />
          <InfoRow compact label={t("reasoning")} value={formatBoolean(t, model.is_reasoning === true)} />
          <InfoRow compact label={t("contextWindow")} value={formatTokens(model.context_window_tokens, t)} />
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow compact label={t("promptPrice")} value={formatPricePerMillion(model.pricing?.input, t)} />
          <InfoRow compact label={t("completionPrice")} value={formatPricePerMillion(model.pricing?.output, t)} />
          <InfoRow
            compact
            label={t("cacheHitPrice")}
            value={formatPricePerMillion(model.pricing?.cacheHit ?? model.pricing?.cache_hit, t)}
          />
          <InfoRow compact label={t("blendedPrice")} value={formatPricePerMillion(model.blended_price, t)} />
        </InfoCard>
      </InfoGrid>
      {showBenchmarks && model.benchmarks && Object.values(model.benchmarks).some((v) => v != null) && (
        <DetailSection title={t("benchmarks")}>
          <StatGrid columns={4}>
            {Object.entries(model.benchmarks).map(([key, value]) => {
              // Skip benchmarks the model didn't report (normalizePercent returns null).
              // GDPval arrives as an absolute points score with a 95% CI (e.g. 1823.94),
              // not a 0-1 accuracy fraction — percent normalization would clamp every
              // model to 100, so absolute scores render as-is.
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
