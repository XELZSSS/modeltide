import { useAllOpenSourceModels } from "@/client/api/queries";
import { shortModelId } from "@/client/utils/model";
import { OsDetail } from "@/client/features/models/model-details/os-detail";
import { createDetailView } from "@/client/features/models/model-details/detail-views";

export const OSDetail = createDetailView(useAllOpenSourceModels, "os", OsDetail, (m) => shortModelId(m.id), "id");
