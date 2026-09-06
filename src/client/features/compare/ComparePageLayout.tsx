import { useCallback, useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/client/components/ui/button";
import { BackButton, Spinner } from "@/client/components/feedback";
import { CompareChipBar } from "@/client/components/compare-tray";
import { useTranslation } from "@/client/providers";
import { useCompareStore, useCompareModels } from "@/client/stores";
import { useArtificialRankings } from "@/client/api/queries";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { PageContainer, PageHeader } from "@/client/components/layout";

function useComparedModelsOrNull(): ArtificialAnalysisModel[] | null {
  const rankingsQ = useArtificialRankings();
  const models = useCompareModels(rankingsQ.data ?? []);
  return useMemo(() => {
    if (rankingsQ.isError) return [];
    if (rankingsQ.isPending || !rankingsQ.data) return null;
    return models;
  }, [rankingsQ.isPending, rankingsQ.isError, rankingsQ.data, models]);
}

interface ComparePageLayoutProps {
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  children: (models: ArtificialAnalysisModel[]) => React.ReactNode;
}

export function ComparePageLayout({ backLabelKey, backTo, title, children }: ComparePageLayoutProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const removeCompareModel = useCompareStore((s) => s.removeCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const compareIds = useCompareStore((s) => s.compareIds);
  const models = useComparedModelsOrNull();
  const pruned = compareIds.length > (models?.length ?? 0);
  const handleClearAndBack = useCallback(() => {
    clearCompare();
    navigate(backTo);
  }, [clearCompare, navigate, backTo]);
  const handleBack = useCallback(() => navigate(backTo), [navigate, backTo]);

  if (models === null) return <Spinner />;

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
