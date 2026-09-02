import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { Spinner, NotFound, BackButton } from "@/client/components/shared";
import { PageHeader } from "@/client/components/layout";
import {
  useSuspenseArtificialRankings,
  useAllOpenSourceModels,
  useSuspenseOpenRouterRankings,
} from "@/client/api/queries";
import { findModel, shortModelId } from "@/client/utils";
import { MODEL_SOURCES, type ModelSource } from "@/shared/config";
import { ModelDetailContent } from "./ModelDetailContent";
import { OsDetail } from "./OsDetailView";
import { OpenRouterModelDetail } from "./OpenRouterModelDetail";

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
