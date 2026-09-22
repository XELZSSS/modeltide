import { useCallback, useEffect, useMemo } from "react";
import { useRouter } from "@/client/router";
import { Button } from "@/client/components/ui/button";
import { CenteredPageState, EmptyState, Spinner } from "@/client/components/feedback";
import { CompareChipBar } from "./compare-tray";
import { useTranslation } from "@/client/providers";
import { useCompareStore, useCompareModels } from "@/client/stores";
import { useArtificialRankings } from "@/client/api/api-queries";
import { modelId } from "@/client/utils/model-utils";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { BackButton, DetailPageLayout, PageContainer } from "@/client/components/layout";

function useComparedRankings(): {
  compared: ArtificialAnalysisModel[] | null;
  isError: boolean;
  refetch: () => void;
} {
  const rankingsQ = useArtificialRankings();
  const models = useCompareModels(rankingsQ.data);
  const pruneCompare = useCompareStore((s) => s.pruneCompare);
  const validIds = useMemo(() => new Set(rankingsQ.data.map(modelId).filter(Boolean)), [rankingsQ.data]);
  useEffect(() => {
    // A failed or still-empty list proves nothing about the stored ids, so only a
    // loaded, non-empty list may drop them.
    if (rankingsQ.isPending || rankingsQ.isError || validIds.size === 0) return;
    pruneCompare(validIds);
  }, [validIds, rankingsQ.isPending, rankingsQ.isError, pruneCompare]);
  const compared = useMemo(() => {
    if (rankingsQ.isError) return [];
    if (rankingsQ.isPending) return null;
    return models;
  }, [rankingsQ.isPending, rankingsQ.isError, models]);
  return { compared, isError: rankingsQ.isError, refetch: rankingsQ.refetch };
}

interface ComparePageLayoutProps {
  /** Fallback destination for a direct landing; the back button itself returns to wherever the reader came from. */
  backTo: string;
  title: string;
  children: (models: ArtificialAnalysisModel[]) => React.ReactNode;
}

export function ComparePageLayout({ backTo, title, children }: ComparePageLayoutProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const removeCompareModel = useCompareStore((s) => s.removeCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const compareIds = useCompareStore((s) => s.compareIds);
  const { compared: models, isError: rankingsFailed, refetch: refetchRankings } = useComparedRankings();
  const pruned = compareIds.length > (models?.length ?? 0);
  const handleClearAndBack = useCallback(() => {
    clearCompare();
    router.push(backTo);
  }, [clearCompare, router, backTo]);

  if (models === null) return <Spinner />;

  if (rankingsFailed) {
    return (
      <CenteredPageState>
        <EmptyState variant="error" title={t("errorBoundaryTitle")} message={t("loadFailed")} />
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => refetchRankings()}>
            {t("errorBoundaryRetry")}
          </Button>
          <BackButton labelKey="back" to={backTo} />
        </div>
      </CenteredPageState>
    );
  }

  if (models.length < 2) {
    return (
      <CenteredPageState>
        <EmptyState message={t("compareLimit")} compact />
        {pruned && (
          <p className="ui-caption" role="status">
            {t("compareStale")}
          </p>
        )}
        <BackButton labelKey="back" to={backTo} />
      </CenteredPageState>
    );
  }

  return (
    <PageContainer>
      <DetailPageLayout
        backLabelKey="back"
        backTo={backTo}
        title={title}
        description={t("artificialSource")}
        compact
      >
        <CompareChipBar models={models} onRemove={removeCompareModel} onClear={handleClearAndBack} />
        {children(models)}
      </DetailPageLayout>
    </PageContainer>
  );
}
