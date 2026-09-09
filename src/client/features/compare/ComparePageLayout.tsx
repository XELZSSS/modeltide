"use client";
import { useCallback, useMemo } from "react";
import { useRouter } from "@/client/router";
import { Button } from "@/client/components/ui/button";
import { BackButton, EmptyState, Spinner } from "@/client/components/feedback";
import { CompareChipBar } from "@/client/components/compare-tray";
import { useTranslation } from "@/client/providers";
import { useCompareStore, useCompareModels } from "@/client/stores";
import { useArtificialRankings } from "@/client/api/queries";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { PageContainer, PageHeader } from "@/client/components/layout";

function useComparedModelsOrNull(): ArtificialAnalysisModel[] | null {
  const rankingsQ = useArtificialRankings();
  const models = useCompareModels(rankingsQ.data);
  return useMemo(() => {
    if (rankingsQ.isError) return [];
    if (rankingsQ.isPending) return null;
    return models;
  }, [rankingsQ.isPending, rankingsQ.isError, models]);
}

interface ComparePageLayoutProps {
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  children: (models: ArtificialAnalysisModel[]) => React.ReactNode;
}

export function ComparePageLayout({ backLabelKey, backTo, title, children }: ComparePageLayoutProps) {
  const router = useRouter();
  const navigate = (to: string) => router.push(to);
  const { t } = useTranslation();
  const removeCompareModel = useCompareStore((s) => s.removeCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const compareIds = useCompareStore((s) => s.compareIds);
  const models = useComparedModelsOrNull();
  const { isError: rankingsFailed, refetch: refetchRankings } = useArtificialRankings();
  const pruned = compareIds.length > (models?.length ?? 0);
  const handleClearAndBack = useCallback(() => {
    clearCompare();
    navigate(backTo);
  }, [clearCompare, navigate, backTo]);
  const handleBack = useCallback(() => navigate(backTo), [navigate, backTo]);

  if (models === null) return <Spinner />;

  if (rankingsFailed) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-4 items-center py-16">
          <EmptyState variant="error" title={t("errorBoundaryTitle")} message={t("loadFailed")} />
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={() => refetchRankings()}>
              {t("errorBoundaryRetry")}
            </Button>
            <Button size="sm" variant="outline" onClick={handleBack}>
              {t("backToList")}
            </Button>
          </div>
        </div>
      </PageContainer>
    );
  }

  if (models.length < 2) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-4 items-center py-16">
          <p className="text-sm text-text-secondary">{t("compareLimit")}</p>
          {pruned && (
            <p className="text-xs text-text-tertiary" role="status">
              {t("compareStale")}
            </p>
          )}
          <Button size="sm" variant="outline" onClick={handleBack}>
            {t("backToList")}
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
      <div className="flex flex-col gap-4 min-w-0">
        <BackButton labelKey={backLabelKey} to={backTo} />
        <PageHeader compact title={title} description={t("artificialSource")} />
        <CompareChipBar models={models} onRemove={removeCompareModel} onClear={handleClearAndBack} />
        {children(models)}
      </div>
    </PageContainer>
  );
}
