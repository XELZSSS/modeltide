"use client";
import { lazy } from "react";
import { useParams } from "@/client/router";
import { MODEL_SOURCES, type ModelSource } from "@/client/config/navigation";
import { NotFound, SuspenseQuery } from "@/client/components/feedback";
import { PageContainer } from "@/client/components/layout";

const SOURCE_COMPONENTS: Record<ModelSource, React.ComponentType<{ decodedId: string }>> = {
  aa: lazy(() => import("@/client/features/models/model-details/aa-detail").then((m) => ({ default: m.AADetail }))),
  or: lazy(() => import("@/client/features/models/model-details/or-detail").then((m) => ({ default: m.OrDetail }))),
  os: lazy(() => import("@/client/features/models/model-details/os-detail").then((m) => ({ default: m.OSDetail }))),
  hall: lazy(() =>
    import("@/client/features/models/model-details/hall-detail").then((m) => ({ default: m.HallDetail })),
  ),
};

function isModelSource(value: string): value is ModelSource {
  return Object.hasOwn(MODEL_SOURCES, value);
}

function useModelSourceParams(): { src: ModelSource | null; decodedId: string } {
  const params = useParams<{ source: string; wildcard: string }>("/model/:source/*");
  const src = params.source && isModelSource(params.source) ? params.source : null;
  return { src, decodedId: params.wildcard ?? "" };
}

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

export function ModelDetailView() {
  return (
    <SuspenseQuery>
      <ModelDetailContentInner />
    </SuspenseQuery>
  );
}
