"use client";
import { useCallback, useMemo } from "react";
import { useRouter } from "@/client/router";
import { Button } from "@/client/components/ui/button";
import { CenteredPageState, EmptyState, Spinner } from "@/client/components/feedback";
import { CompareChipBar } from "@/client/components/compare-tray";
import { useTranslation } from "@/client/providers";
import { useCompareStore, useCompareModels } from "@/client/stores";
import { useArtificialRankings } from "@/client/api/queries";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { BackButton, DetailPageLayout, PageContainer } from "@/client/components/layout";

function useComparedRankings(): {
  compared: ArtificialAnalysisModel[] | null;
  isError: boolean;
  refetch: () => void;
} {
  const rankingsQ = useArtificialRankings();
  const models = useCompareModels(rankingsQ.data);
  const compared = useMemo(() => {
    if (rankingsQ.isError) return [];
    if (rankingsQ.isPending) return null;
    return models;
  }, [rankingsQ.isPending, rankingsQ.isError, models]);
  return { compared, isError: rankingsQ.isError, refetch: rankingsQ.refetch };
}

interface ComparePageLayoutProps {
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  children: (models: ArtificialAnalysisModel[]) => React.ReactNode;
}

export function ComparePageLayout({ backLabelKey, backTo, title, children }: ComparePageLayoutProps) {
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
          <BackButton labelKey="backToList" to={backTo} />
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
        <BackButton labelKey="backToList" to={backTo} />
      </CenteredPageState>
    );
  }

  return (
    <PageContainer>
      <DetailPageLayout
        backLabelKey={backLabelKey}
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
