import type { ComponentType, ReactNode } from "react";
import { useTranslation } from "@/client/providers";
import { MODEL_SOURCES, type ModelSource } from "@/client/config/nav-config";
import { NotFound, PartialNotice } from "@/client/components/feedback";
import { DetailPageLayout } from "@/client/components/layout";

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
  useData: () => { data?: T[]; partial?: boolean },
  source: ModelSource,
  Content: ComponentType<{ model: T }>,
  titleOf: (model: T) => string,
  ...keys: (keyof T & string)[]
): ComponentType<{ decodedId: string }> {
  return function DetailView({ decodedId }: { decodedId: string }) {
    const { data, partial } = useData();
    const model = data ? findModel(data, decodedId, ...keys) : undefined;
    if (!model) return <NotFound />;
    return (
      <DetailShell source={source} title={titleOf(model)}>
        {partial && <PartialNotice />}
        <Content model={model} />
      </DetailShell>
    );
  };
}
