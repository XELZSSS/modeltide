import { useSuspenseArtificialRankings } from "@/client/api/queries";
import { ModelDetailContent } from "@/client/features/models/model-details/aa-detail";
import { createDetailView } from "@/client/features/models/model-details/detail-views";

export const AADetail = createDetailView(
  useSuspenseArtificialRankings,
  "aa",
  ModelDetailContent,
  (m) => m.name,
  "id",
  "slug",
);
