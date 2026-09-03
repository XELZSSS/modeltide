import { useTranslation } from "@/client/providers";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import { type BenchmarkKey, MODEL_SOURCES, type ModelSource } from "@/shared/config";
import type {
  ArtificialAnalysisModel,
  OpenSourceModelEntry,
  OpenRouterRankEntry,
  HallucinationRankingEntry,
} from "@/shared/types";
import {
  formatBoolean,
  formatPricePerMillion,
  formatScore,
  formatTokens,
  benchmarkLabel,
  orNA,
  normalizePercent,
  getOutputSpeed,
  formatShortNumber,
  formatDate,
  categoryLabel,
  formatTrend,
  shortModelId,
  formatIndex,
  formatPercent,
} from "@/client/utils";
import {
  DetailLayout,
  DetailSection,
  StatGrid,
  InfoGrid,
  InfoCard,
  InfoRow,
  StatCard,
  Badge,
} from "@/client/components/ui";
import type { ComponentType, ReactNode } from "react";
import { Spinner, NotFound, BackButton, SuspenseQuery } from "@/client/components/shared";
import { PageHeader, PageContainer } from "@/client/components/layout";
import {
  useSuspenseArtificialRankings,
  useAllOpenSourceModels,
  useSuspenseOpenRouterRankings,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { useParams } from "react-router";

// ---- client/features/models/ModelDetailContent.tsx ----
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

// ---- client/features/models/OsDetailView.tsx ----
/** Open-source model detail body (Hugging Face metadata + repository link). */
export function OsDetail({ model }: { model: OpenSourceModelEntry }) {
  const { t, lang } = useTranslation();
  return (
    <DetailLayout>
      <StatGrid columns={2}>
        <StatCard label={t("downloads")} value={formatShortNumber(model.downloads)} />
        <StatCard label={t("likes")} value={formatShortNumber(model.likes)} />
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow compact label={t("creator")} value={orNA(model.author, t)} />
          <InfoRow compact label={t("license")} value={orNA(model.license, t)} />
          <InfoRow compact label={t("task")} value={orNA(model.task, t)} />
          <InfoRow
            compact
            label={t("releaseDate")}
            value={model.createdAt ? formatDate(model.createdAt, lang) : t("notAvailable")}
          />
          <InfoRow
            compact
            label={t("lastUpdated")}
            value={model.lastModified ? formatDate(model.lastModified, lang) : t("notAvailable")}
          />
        </InfoCard>
        <InfoCard title={t("repository")}>
          {/* Hugging Face URLs must not start with a slash, so strip it from the model id. */}
          <a
            href={`https://huggingface.co/${(model.id ?? "").replace(/^\//, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-accent hover:underline break-all"
          >
            {model.id}
          </a>
        </InfoCard>
      </InfoGrid>
      {(model.tags ?? []).length > 0 && (
        <DetailSection title={t("tags")}>
          <div className="flex flex-wrap gap-1.5">
            {(model.tags ?? []).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailLayout>
  );
}

// ---- client/features/models/OpenRouterModelDetail.tsx ----
// Prices are stored per token; convert to per-million-token for display consistency.
function toPerMillion(price: number | null | undefined): number | undefined {
  return typeof price === "number" && Number.isFinite(price) ? price * 1_000_000 : undefined;
}

/** Detail view for an OpenRouter ranking entry: stats, pricing, recommendation and badges. */
export function OpenRouterModelDetail({ model }: { model: OpenRouterRankEntry }) {
  const { t } = useTranslation();
  // Only surface meaningful variants; "standard"/"free" are the defaults and add noise.
  const showVariantBadge = !!model.variant && model.variant !== "standard" && model.variant !== "free";
  return (
    <DetailLayout>
      <StatGrid columns={4}>
        <StatCard label={t("creator")} value={model.creator} />
        <StatCard label={t("inputTokens")} value={formatShortNumber(model.promptTokens ?? 0)} />
        <StatCard label={t("outputTokens")} value={formatShortNumber(model.completionTokens ?? 0)} />
        {model.reasoningTokens ? (
          <StatCard label={t("reasoningTokens")} value={formatShortNumber(model.reasoningTokens)} />
        ) : (
          <StatCard label={t("category")} value={categoryLabel(model.category, t)} />
        )}
      </StatGrid>
      <InfoGrid>
        <InfoCard title={t("modelInfo")}>
          <InfoRow
            compact
            label={t("apiModelId")}
            value={<code className="font-mono text-xs bg-bg-secondary px-1 rounded">{model.id}</code>}
          />
          <InfoRow compact label={t("category")} value={categoryLabel(model.category, t)} />
          <InfoRow compact label={t("trend")} value={formatTrend(model.change, t)} />
          <InfoRow compact label={t("totalTokens")} value={formatShortNumber(model.totalTokens ?? 0)} />
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow
            compact
            label={t("cacheHitPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.input_cache_read), t)}
          />
          <InfoRow
            compact
            label={t("promptPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.prompt), t)}
          />
          <InfoRow
            compact
            label={t("completionPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.completion), t)}
          />
        </InfoCard>
      </InfoGrid>
      {(showVariantBadge || model.isFree) && (
        <div className="flex flex-wrap gap-1.5">
          {showVariantBadge && <Badge>{model.variant}</Badge>}
          {model.isFree && <Badge className="text-success">{t("free")}</Badge>}
        </div>
      )}
    </DetailLayout>
  );
}

// ---- client/features/models/detailViews.tsx ----
export function findModel<T>(data: T[], id: string, ...keys: (keyof T & string)[]): T | undefined {
  return data.find((item) => keys.some((key) => (item[key] as unknown) === id));
}

/** Shared detail-page shell: back link + page header resolved from the model source config. */
export function DetailShell({ source, title, children }: { source: ModelSource; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const config = MODEL_SOURCES[source];
  return (
    <>
      <BackButton labelKey={config.backLabelKey} to={config.backTo} />
      <PageHeader title={title} description={t(config.sourceLabelKey)} />
      {children}
    </>
  );
}

/**
 * Factory building a self-contained detail view: it looks a model up by the given
 * fields and renders the detail shell with the resolved model name (URL ids can be
 * opaque UUIDs) and the detail body.
 */
function createDetailView<T>(
  useQuery: () => { data: T[] | undefined; isPending?: boolean; isError?: boolean },
  source: ModelSource,
  Content: ComponentType<{ model: T }>,
  titleOf: (model: T) => string,
  ...keys: (keyof T & string)[]
): ComponentType<{ decodedId: string }> {
  return function DetailView({ decodedId }: { decodedId: string }) {
    const { t } = useTranslation();
    const { data, isPending, isError } = useQuery();
    if (!data && isPending) return <Spinner />;
    const model = data ? findModel(data, decodedId, ...keys) : undefined;
    if (!model && isPending) return <Spinner />;
    // A failed (non-suspense) query leaves data undefined with isPending false;
    // that must surface as a load error, not as a 404-style "model not found".
    if (!model && isError) {
      return (
        <div className="py-20 text-center text-sm text-text-secondary" role="alert">
          {t("loadFailed")}
        </div>
      );
    }
    if (!model) return <NotFound />;
    return (
      <DetailShell source={source} title={titleOf(model)}>
        <Content model={model} />
      </DetailShell>
    );
  };
}

export const AADetail = createDetailView(
  useSuspenseArtificialRankings,
  "aa",
  ModelDetailContent,
  (m) => m.name,
  "id",
  "slug",
);

export const OrDetail = createDetailView(
  () => {
    const { data } = useSuspenseOpenRouterRankings();
    return { data: data?.tokenUsageRankings };
  },
  "or",
  OpenRouterModelDetail,
  (m) => m.name,
  "id",
);

export const OSDetail = createDetailView(useAllOpenSourceModels, "os", OsDetail, (m) => shortModelId(m.id), "id");

// ---- client/features/models/HallDetailView.tsx ----
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
  // Hall ids/slugs don't always match AA's; fall back to a name match before
  // hiding the linked AA section (a silent empty section looks like a bug).
  const aaModel =
    findModel(aaData, decodedId, "id", "slug") ??
    (entry ? aaData.find((m) => m.name === entry.model || m.slug === entry.slug) : undefined);
  if (!entry) return <NotFound />;
  return (
    <DetailShell source="hall" title={entry.model}>
      <HallDetailContent model={entry} aaModel={aaModel} />
    </DetailShell>
  );
}

// ---- client/features/models/ModelDetailView.tsx ----
// The wildcard route param carries the model id/slug, which may be URL-encoded
// (e.g. slashes in Hugging Face ids); decode defensively.
function isModelSource(value: string): value is ModelSource {
  return value in MODEL_SOURCES;
}

function useModelSourceParams(): { src: ModelSource | null; decodedId: string } {
  const { source, "*": splat } = useParams<{ source: string; "*": string }>();
  const src = source && isModelSource(source) ? source : null;
  let decodedId = "";
  if (splat) {
    try {
      decodedId = decodeURIComponent(splat);
    } catch (e) {
      console.warn("[model-detail] failed to decode URI:", e);
      decodedId = splat;
    }
  }
  return { src, decodedId };
}

// Dispatch table mapping each model source (aa/or/os/hall) to its detail view.
const SOURCE_COMPONENTS: Record<ModelSource, React.ComponentType<{ decodedId: string }>> = {
  aa: AADetail,
  or: OrDetail,
  os: OSDetail,
  hall: HallDetail,
};

function ModelDetailContentInner() {
  const { src, decodedId } = useModelSourceParams();

  if (!src || !decodedId) return <NotFound />;

  const SourceComponent = SOURCE_COMPONENTS[src]!;

  // Detail views render their own back link and header so the title can come
  // from the resolved model record instead of the raw URL id.
  return (
    <PageContainer>
      <SourceComponent decodedId={decodedId} />
    </PageContainer>
  );
}

/**
 * Model detail page. Reads the source and slug from the URL and renders the
 * matching detail view (Artificial Analysis, OpenRouter, open-source, hallucination).
 */
export function ModelDetailView() {
  return (
    <SuspenseQuery>
      <ModelDetailContentInner />
    </SuspenseQuery>
  );
}
