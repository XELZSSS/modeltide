import { useMemo } from "react";
import { useNavigate } from "react-router";
import { Button } from "@/client/components/ui";
import { BackButton, Spinner } from "@/client/components/shared";
import { CompareChipBar, useCompareModels } from "@/client/components/compare";
import { useTranslation } from "@/client/providers";
import { useCompareStore } from "@/client/stores";
import { useArtificialRankings } from "@/client/api/queries";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { PageContainer, PageHeader } from "@/client/components/layout";

function useComparedModelsOrNull(): ArtificialAnalysisModel[] | null {
  const rankingsQ = useArtificialRankings();
  const models = useCompareModels(rankingsQ.data ?? []);
  return useMemo(() => {
    // A failed rankings query must resolve to "no models" (the layout's empty state),
    // otherwise data stays undefined forever and this page spins indefinitely.
    if (rankingsQ.isError) return [];
    if (rankingsQ.isPending || !rankingsQ.data) return null;
    return models;
  }, [rankingsQ.isPending, rankingsQ.isError, rankingsQ.data, models]);
}

interface ComparePageLayoutProps {
  backLabelKey: TranslationKey;
  backTo: string;
  backState?: Record<string, unknown>;
  title: string;
  children: (models: ArtificialAnalysisModel[]) => React.ReactNode;
}

export function ComparePageLayout({ backLabelKey, backTo, backState, title, children }: ComparePageLayoutProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const removeCompareModel = useCompareStore((s) => s.removeCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const models = useComparedModelsOrNull();

  if (models === null) return <Spinner />;

  if (models.length < 2) {
    return (
      <PageContainer>
        <div className="flex flex-col gap-4 items-center py-16">
          <p className="text-sm text-text-secondary">{t("compareLimit")}</p>
          {/* Forward backState so e.g. the pricing view is restored, not reset to rankings. */}
          <Button size="sm" variant="outline" onClick={() => navigate(backTo, { state: backState })}>
            {t("backToList")}
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer className="pt-3 sm:pt-4">
      <div className="flex flex-col gap-4 min-w-0">
        <BackButton labelKey={backLabelKey} to={backTo} state={backState} />
        <PageHeader compact title={title} description={t("artificialSource")} />
        <CompareChipBar
          models={models}
          onRemove={removeCompareModel}
          onClear={() => {
            clearCompare();
            navigate(backTo);
          }}
        />
        {children(models)}
      </div>
    </PageContainer>
  );
}
