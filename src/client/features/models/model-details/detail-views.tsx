"use client";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES, type ModelSource } from "@/shared/config";
import { BackButton, EmptyState, NotFound, Spinner } from "@/client/components/feedback";
import { PageHeader } from "@/client/components/layout";

export function findModel<T>(data: T[], id: string, ...keys: (keyof T & string)[]): T | undefined {
  for (const key of keys) {
    const hit = data.find((item) => (item[key] as unknown) === id);
    if (hit) return hit;
  }
  return undefined;
}

export function DetailShell({ source, title, children }: { source: ModelSource; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const config = MODEL_SOURCES[source];
  return (
    <div className="flex flex-col animate-fade-in">
      <div className="mb-5">
        <BackButton labelKey={config.backLabelKey} to={config.backTo} />
      </div>
      <PageHeader title={title} description={t(config.sourceLabelKey)} />
      <div className="flex flex-col gap-4 sm:gap-5">{children}</div>
    </div>
  );
}

export function createDetailView<T>(
  useQuery: () => T[] | { data?: T[]; isPending?: boolean; isError?: boolean },
  source: ModelSource,
  Content: ComponentType<{ model: T }>,
  titleOf: (model: T) => string,
  ...keys: (keyof T & string)[]
): ComponentType<{ decodedId: string }> {
  return function DetailView({ decodedId }: { decodedId: string }) {
    const { t } = useTranslation();
    const result = useQuery();
    const data = Array.isArray(result) ? result : result.data;
    const isPending = !Array.isArray(result) && !!result.isPending;
    const isError = !Array.isArray(result) && !!result.isError;
    const model = data ? findModel(data, decodedId, ...keys) : undefined;
    if (!model && isPending) return <Spinner />;
    if (!model && isError) {
      return <EmptyState variant="error" message={t("loadFailed")} />;
    }
    if (!model) return <NotFound />;
    return (
      <DetailShell source={source} title={titleOf(model)}>
        <Content model={model} />
      </DetailShell>
    );
  };
}
