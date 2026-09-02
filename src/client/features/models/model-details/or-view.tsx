import { useSuspenseOpenRouterRankings } from "@/client/api/queries";
import { OpenRouterModelDetail } from "@/client/features/models/model-details/or-detail";
import { createDetailView } from "@/client/features/models/model-details/detail-views";

export const OrDetail = createDetailView(
  () => {
    const { data } = useSuspenseOpenRouterRankings();
    if (data && !Array.isArray(data.tokenUsageRankings)) {
      return { data: undefined, isPending: false, isError: true };
    }
    return { data: data?.tokenUsageRankings };
  },
  "or",
  OpenRouterModelDetail,
  (m) => m.name,
  "id",
);
