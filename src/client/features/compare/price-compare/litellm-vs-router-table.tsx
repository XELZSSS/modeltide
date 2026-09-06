import { memo, useMemo } from "react";
import { formatDollar } from "@/client/utils/format";
import type { ArtificialAnalysisModel, OfficialPriceModel } from "@/shared/types";
import { useTranslation } from "@/client/providers";
import { modelId } from "@/client/utils/model";
import { DataTable } from "@/client/components/data/table";
import type { DataTableColumn } from "@/client/components/data/columns";
import { useOfficialPricing } from "@/client/features/pricing/official";
import { EmptyState } from "@/client/components/feedback";

interface OfficialRow {
  model: ArtificialAnalysisModel;
  official: OfficialPriceModel;
}

function formatDiff(ratio: number): string {
  return `${ratio >= 0 ? "+" : ""}${(ratio * 100).toFixed(0)}%`;
}

function buildColumns(t: ReturnType<typeof useTranslation>["t"]): DataTableColumn<OfficialRow>[] {
  const priceCell = (get: (row: OfficialRow) => number | null | undefined) => (row: OfficialRow) => (
    <span className="font-mono text-sm">{formatDollar(get(row), t)}</span>
  );
  return [
    {
      id: "model",
      header: t("model"),
      width: "40%",
      cell: (row) => (
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" title={row.model.name}>
            {row.model.short_name || row.model.name}
          </p>
          <p className="text-xs text-text-secondary truncate">{row.official.provider}</p>
        </div>
      ),
    },
    {
      id: "officialIn",
      header: `${t("officialChannel")} ${t("promptPrice")}`,
      align: "right",
      cell: priceCell((row) => row.official.input),
    },
    {
      id: "officialOut",
      header: `${t("officialChannel")} ${t("completionPrice")}`,
      align: "right",
      hiddenMd: true,
      cell: priceCell((row) => row.official.output),
    },
    {
      id: "routerIn",
      header: `${t("openRouterChannel")} ${t("promptPrice")}`,
      align: "right",
      cell: priceCell((row) => row.model.pricing?.input),
    },
    {
      id: "diff",
      header: t("priceDiff"),
      align: "right",
      hiddenMd: true,
      cell: (row) => {
        const official = row.official.input;
        const router = row.model.pricing?.input;
        if (official == null || router == null || official <= 0) {
          return <span className="text-text-tertiary">{t("notAvailable")}</span>;
        }
        return <span className="font-mono text-sm">{formatDiff((router - official) / official)}</span>;
      },
    },
  ];
}

const getRowId = (row: OfficialRow) => modelId(row.model);

export const LiteLLMVsRouterTable = memo(function LiteLLMVsRouterTable({
  models,
}: {
  models: ArtificialAnalysisModel[];
}) {
  const { t } = useTranslation();
  const { getOfficial, isPending, isError } = useOfficialPricing();
  const columns = useMemo(() => buildColumns(t), [t]);
  const rows = useMemo<OfficialRow[]>(() => {
    if (!getOfficial) return [];
    return models
      .map((model) => {
        const official = getOfficial(model);
        return official ? { model, official } : null;
      })
      .filter((r): r is OfficialRow => r !== null);
  }, [getOfficial, models]);

  if (isPending) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{t("officialVsRouter")}</p>
        <EmptyState message={t("loading")} />
      </div>
    );
  }
  if (isError) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-sm font-semibold">{t("officialVsRouter")}</p>
        <EmptyState message={t("loadFailed")} variant="error" />
      </div>
    );
  }
  if (rows.length === 0) return null;
  return (
    <div className="flex flex-col gap-3">
      <p className="text-sm font-semibold">{t("officialVsRouter")}</p>
      <DataTable data={rows} columns={columns} getRowId={getRowId} />
    </div>
  );
});
