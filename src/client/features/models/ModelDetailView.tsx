import { lazy } from "react";
import { useParams } from "react-router";
import { MODEL_SOURCES, type ModelSource } from "@/shared/config";
import { NotFound, SuspenseQuery } from "@/client/components/feedback";
import { PageContainer } from "@/client/components/layout";

const AADetail = lazy(() =>
  import("@/client/features/models/model-details/aa-view").then((m) => ({ default: m.AADetail })),
);
const OrDetail = lazy(() =>
  import("@/client/features/models/model-details/or-view").then((m) => ({ default: m.OrDetail })),
);
const OSDetail = lazy(() =>
  import("@/client/features/models/model-details/os-view").then((m) => ({ default: m.OSDetail })),
);
const HallDetail = lazy(() =>
  import("@/client/features/models/model-details/hall-detail").then((m) => ({ default: m.HallDetail })),
);

function isModelSource(value: string): value is ModelSource {
  return Object.hasOwn(MODEL_SOURCES, value);
}

function useModelSourceParams(): { src: ModelSource | null; decodedId: string } {
  const { source, "*": splat } = useParams<{ source: string; "*": string }>();
  const src = source && isModelSource(source) ? source : null;
  return { src, decodedId: splat ?? "" };
}

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

export function ModelDetailView() {
  return (
    <SuspenseQuery>
      <ModelDetailContentInner />
    </SuspenseQuery>
  );
}
