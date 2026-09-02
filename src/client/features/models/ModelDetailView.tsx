import { useParams } from "react-router";
import { SuspenseQuery, NotFound } from "@/client/components/shared";
import { PageContainer } from "@/client/components/layout";
import { AADetail, OrDetail, OSDetail } from "./detailViews";
import { HallDetail } from "./HallDetailView";
import { MODEL_SOURCES, type ModelSource } from "@/shared/config";

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
