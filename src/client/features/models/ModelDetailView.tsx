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
  indexOfficialPricing,
  matchOfficialPricing,
  resolveEffectivePricing,
  resolveBlendedPrice,
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
import { useMemo } from "react";
import { Spinner, NotFound, BackButton, SuspenseQuery } from "@/client/components/shared";
import { PageHeader, PageContainer } from "@/client/components/layout";
import {
  qOfficialPricing,
  useSuspenseArtificialRankings,
  useAllOpenSourceModels,
  useSuspenseOpenRouterRankings,
  useSuspenseHallucinationRankings,
} from "@/client/api/queries";
import { useParams } from "react-router";

// ---- ModelDetailContent ----
// Modality pills: theme-aware soft hues with borders (no light-only fills).
const MODALITY_STYLES = {
  text: "border-sky-500/25 bg-sky-500/10 text-sky-700 dark:text-sky-300",
  image: "border-indigo-500/25 bg-indigo-500/10 text-indigo-700 dark:text-indigo-300",
  speech: "border-teal-500/25 bg-teal-500/10 text-teal-700 dark:text-teal-300",
  video: "border-violet-500/25 bg-violet-500/10 text-violet-700 dark:text-violet-300",
} as const;

// Benchmarks reported as absolute scores, not 0-1 fractions.
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
  // Field names follow `<prefix>_modality_<type>`.
  const key = (m: string) => `${prefix}_modality_${m}` as keyof ArtificialAnalysisModel;
  return (
    <div>
      <div className="ui-caption font-medium mb-2.5">{label}</div>
      <div className="flex gap-2 flex-wrap">
        {(["text", "image", "speech", "video"] as const).map((m) =>
          model[key(m)] ? (
            <span key={m} className={`px-2.5 py-1 text-xs font-medium rounded-full border ${MODALITY_STYLES[m]}`}>
              {t(MODALITY_LABEL_KEYS[m])}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
}

/** Full detail view: scores, metadata, pricing, benchmarks, modalities. */
export function ModelDetailContent({
  model,
  showBenchmarks = true,
}: {
  model: ArtificialAnalysisModel;
  showBenchmarks?: boolean;
}) {
  const { t } = useTranslation();
  const officialQ = qOfficialPricing.use();
  const official = useMemo(() => {
    if (!officialQ.data) return undefined;
    return matchOfficialPricing(indexOfficialPricing(officialQ.data.models), model);
  }, [officialQ.data, model]);
  const pricing = useMemo(() => resolveEffectivePricing(model.pricing, official), [model.pricing, official]);
  const blended = useMemo(() => resolveBlendedPrice(model, official), [model, official]);
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
          <InfoRow label={t("creator")} value={orNA(model.model_creators?.name, t)} />
          <InfoRow label={t("releaseDate")} value={orNA(model.release_date, t)} />
          <InfoRow label={t("openWeights")} value={formatBoolean(t, model.is_open_weights)} />
          <InfoRow label={t("reasoning")} value={formatBoolean(t, model.is_reasoning === true)} />
          <InfoRow label={t("contextWindow")} value={formatTokens(model.context_window_tokens, t)} />
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow label={t("promptPrice")} value={formatPricePerMillion(pricing.input, t)} />
          <InfoRow label={t("completionPrice")} value={formatPricePerMillion(pricing.output, t)} />
          <InfoRow label={t("cacheHitPrice")} value={formatPricePerMillion(pricing.cache_hit, t)} />
          <InfoRow label={t("blendedPrice")} value={formatPricePerMillion(blended, t)} />
        </InfoCard>
      </InfoGrid>
      {showBenchmarks && model.benchmarks && Object.values(model.benchmarks).some((v) => v != null) && (
        <DetailSection title={t("benchmarks")}>
          <StatGrid columns={4}>
            {Object.entries(model.benchmarks).map(([key, value]) => {
              // Skip unreported benchmarks; GDPval is absolute points, render as-is.
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

// ---- OsDetailView ----
/** Open-source model detail (HF metadata + repository link). */
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
          <InfoRow label={t("creator")} value={orNA(model.author, t)} />
          <InfoRow label={t("license")} value={orNA(model.license, t)} />
          <InfoRow label={t("task")} value={orNA(model.task, t)} />
          <InfoRow
            label={t("releaseDate")}
            value={model.createdAt ? formatDate(model.createdAt, lang) : t("notAvailable")}
          />
          <InfoRow
            label={t("lastUpdated")}
            value={model.lastModified ? formatDate(model.lastModified, lang) : t("notAvailable")}
          />
        </InfoCard>
        <InfoCard title={t("repository")}>
          <a
            href={`https://huggingface.co/${(model.id ?? "").replace(/^\//, "")}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-accent hover:underline break-all"
          >
            {model.id}
          </a>
        </InfoCard>
      </InfoGrid>
      {(model.tags ?? []).length > 0 && (
        <DetailSection title={t("tags")}>
          <div className="flex flex-wrap gap-2">
            {(model.tags ?? []).map((tag) => (
              <Badge key={tag}>{tag}</Badge>
            ))}
          </div>
        </DetailSection>
      )}
    </DetailLayout>
  );
}

// ---- OpenRouterModelDetail ----
// Prices are per token; display per million.
function toPerMillion(price: number | null | undefined): number | undefined {
  return typeof price === "number" && Number.isFinite(price) ? price * 1_000_000 : undefined;
}

/** OpenRouter entry detail: stats, pricing, recommendation, badges. */
export function OpenRouterModelDetail({ model }: { model: OpenRouterRankEntry }) {
  const { t } = useTranslation();
  // "standard"/"free" are defaults; only other variants get a badge.
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
            label={t("apiModelId")}
            value={<code className="font-mono text-xs bg-bg-secondary px-1.5 py-0.5 rounded-md">{model.id}</code>}
          />
          <InfoRow label={t("category")} value={categoryLabel(model.category, t)} />
          <InfoRow label={t("trend")} value={formatTrend(model.change, t)} />
          <InfoRow label={t("totalTokens")} value={formatShortNumber(model.totalTokens ?? 0)} />
        </InfoCard>
        <InfoCard title={t("pricing")}>
          <InfoRow
            label={t("cacheHitPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.input_cache_read), t)}
          />
          <InfoRow
            label={t("promptPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.prompt), t)}
          />
          <InfoRow
            label={t("completionPrice")}
            value={formatPricePerMillion(toPerMillion(model.pricing?.completion), t)}
          />
        </InfoCard>
      </InfoGrid>
      {(showVariantBadge || model.isFree) && (
        <div className="flex flex-wrap gap-2">
          {showVariantBadge && <Badge>{model.variant}</Badge>}
          {model.isFree && <Badge className="text-success">{t("free")}</Badge>}
        </div>
      )}
    </DetailLayout>
  );
}

// ---- detailViews ----
export function findModel<T>(data: T[], id: string, ...keys: (keyof T & string)[]): T | undefined {
  return data.find((item) => keys.some((key) => (item[key] as unknown) === id));
}

/** Detail-page shell: back link + header from the model source config. */
export function DetailShell({ source, title, children }: { source: ModelSource; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const config = MODEL_SOURCES[source];
  return (
    <div className="flex flex-col">
      <div className="mb-4">
        <BackButton labelKey={config.backLabelKey} to={config.backTo} />
      </div>
      <PageHeader title={title} description={t(config.sourceLabelKey)} />
      {children}
    </div>
  );
}

/** Factory: look a model up by fields, render shell + body. Handles pending/error/missing. */
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
    // Failed query (data undefined, not pending) is a load error, not a 404.
    if (!model && isError) {
      return (
        <div className="py-16 text-center ui-body-secondary" role="alert">
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

// ---- HallDetailView ----
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
    </DetailLayout>
  );
}

/** Hallucination detail; metrics come from the same AA dataset. */
export function HallDetail({ decodedId }: { decodedId: string }) {
  const { data: aaData } = useSuspenseArtificialRankings();
  const hallucinationRankings = useSuspenseHallucinationRankings();
  const entry = findModel(hallucinationRankings, decodedId, "id", "slug");
  // Hall ids don't always match AA's; fall back to a name match.
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

// ---- ModelDetailView ----
// The wildcard param carries the id/slug, possibly URL-encoded; decode defensively.
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

// Dispatch table: model source → detail view.
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

  return (
    <PageContainer>
      <SourceComponent decodedId={decodedId} />
    </PageContainer>
  );
}

/** Model detail page: source + slug from the URL. */
export function ModelDetailView() {
  return (
    <SuspenseQuery>
      <ModelDetailContentInner />
    </SuspenseQuery>
  );
}
