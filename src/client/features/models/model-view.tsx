import { lazy } from "react";
import { useParams } from "@/client/router";
import { MODEL_SOURCES, type ModelSource } from "@/client/config/nav-config";
import { NotFound } from "@/client/components/feedback";
import { SuspenseQuery } from "@/client/router/suspense-query";
import { PageContainer } from "@/client/components/layout";

const SOURCE_COMPONENTS: Record<ModelSource, React.ComponentType<{ decodedId: string }>> = {
  aa: lazy(() => import("@/client/features/models/model-details/aa-detail").then((m) => ({ default: m.AADetail }))),
  or: lazy(() =>
    import("@/client/features/models/model-details/openrouter-detail").then((m) => ({ default: m.OrDetail })),
  ),
  os: lazy(() =>
    import("@/client/features/models/model-details/open-source-detail").then((m) => ({ default: m.OSDetail })),
  ),
  hall: lazy(() =>
    import("@/client/features/models/model-details/hallucination-detail").then((m) => ({ default: m.HallDetail })),
  ),
};

function isModelSource(value: string): value is ModelSource {
  return Object.hasOwn(MODEL_SOURCES, value);
}

function ModelDetailContentInner() {
  const params = useParams<{ source: string; wildcard: string }>("/model/:source/*");
  const src = params.source && isModelSource(params.source) ? params.source : null;
  const decodedId = params.wildcard ?? "";

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
