import { useMemo } from "react";
import { ShieldAlert } from "lucide-react";
import { SearchableDataTable } from "@/client/components/data";

import { EmptyState } from "@/client/components/shared";
import { OpenRouterModelDetail } from "@/client/features/models/OpenRouterModelDetail";
import type { OpenRouterRankingsPayload, OpenRouterRankEntry } from "@/shared/types";
import { useTranslation } from "@/client/providers";
import { buildOpenRouterColumns } from "@/client/features/rankings/openRouterColumns";

const getModelRowId = (r: OpenRouterRankEntry) => r.id;
const getSearchFields = (r: OpenRouterRankEntry) => [r.name, r.creator, r.id];
const renderExpandedDetail = (item: OpenRouterRankEntry) => (
  <div className="p-4 sm:p-5">
    <OpenRouterModelDetail model={item} />
  </div>
);

/** Token-usage rankings table from OpenRouter, with expandable per-model details. */
export function OpenRouterRankingsView({ data }: { data?: OpenRouterRankingsPayload }) {
  const { t } = useTranslation();
  const modelColumns = useMemo(() => buildOpenRouterColumns(t), [t]);

  if (!data) {
    return <EmptyState icon={ShieldAlert} message={t("noRankingsData")} />;
  }

  return (
    <SearchableDataTable
      data={data.tokenUsageRankings ?? []}
      columns={modelColumns}
      getRowId={getModelRowId}
      getSearchFields={getSearchFields}
      renderExpandedRow={renderExpandedDetail}
    />
  );
}
