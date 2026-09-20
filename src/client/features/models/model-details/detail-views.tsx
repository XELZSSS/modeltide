"use client";
import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES, type ModelSource } from "@/shared/config";
import type { TranslationKey } from "@/shared/i18n";
import { BackButton, EmptyState, NotFound, Spinner } from "@/client/components/feedback";
import { PageHeader } from "@/client/components/layout";

export function findModel<T>(data: T[], id: string, ...keys: (keyof T & string)[]): T | undefined {
  for (const key of keys) {
    const hit = data.find((item) => (item[key] as unknown) === id);
    if (hit) return hit;
  }
  return undefined;
}

export function DetailPageLayout({
  backLabelKey,
  backTo,
  title,
  description,
  compact,
  children,
}: {
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  description?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 min-w-0 animate-fade-in">
      <BackButton labelKey={backLabelKey} to={backTo} />
      <PageHeader compact={compact} title={title} description={description} />
      <div className="flex flex-col gap-4 sm:gap-5">{children}</div>
    </div>
  );
}

export function DetailShell({ source, title, children }: { source: ModelSource; title: string; children: ReactNode }) {
  const { t } = useTranslation();
  const config = MODEL_SOURCES[source];
  return (
    <DetailPageLayout
      backLabelKey={config.backLabelKey}
      backTo={config.backTo}
      title={title}
      description={t(config.sourceLabelKey)}
    >
      {children}
    </DetailPageLayout>
  );
}

export function createDetailView<T>(
  useData: () => { data?: T[]; isPending?: boolean; isError?: boolean },
  source: ModelSource,
  Content: ComponentType<{ model: T }>,
  titleOf: (model: T) => string,
  ...keys: (keyof T & string)[]
): ComponentType<{ decodedId: string }> {
  return function DetailView({ decodedId }: { decodedId: string }) {
    const { t } = useTranslation();
    const { data, isPending, isError } = useData();
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
