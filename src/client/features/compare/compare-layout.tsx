import { useCallback } from "react";
import { useRouter } from "@/client/router";
import { CenteredPageState, EmptyState } from "@/client/components/feedback";
import { CompareChipBar } from "./compare-tray";
import { useTranslation } from "@/client/providers";
import { useCompareModels, useCompareStore, usePruneCompareIds } from "@/client/stores";
import { useSuspenseArtificialRankings } from "@/client/api/api-queries";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { BackButton, DetailPageLayout, PageContainer } from "@/client/components/layout";
import { SuspenseQuery } from "@/client/router/suspense-query";

interface ComparePageLayoutProps {
  backTo: string;
  title: string;
  children: (models: ArtificialAnalysisModel[]) => React.ReactNode;
}

function CompareLayoutContent({ backTo, title, children }: ComparePageLayoutProps) {
  const router = useRouter();
  const { t } = useTranslation();
  const removeCompareModel = useCompareStore((s) => s.removeCompareModel);
  const clearCompare = useCompareStore((s) => s.clearCompare);
  const compareIds = useCompareStore((s) => s.compareIds);
  const rankings = useSuspenseArtificialRankings();
  const models = useCompareModels(rankings);
  usePruneCompareIds(rankings);
  const pruned = compareIds.length > models.length;
  const handleClearAndBack = useCallback(() => {
    clearCompare();
    router.replace(backTo);
  }, [clearCompare, router, backTo]);

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
      <DetailPageLayout backLabelKey="back" backTo={backTo} title={title} description={t("artificialSource")} compact>
        <CompareChipBar models={models} onRemove={removeCompareModel} onClear={handleClearAndBack} />
        {children(models)}
      </DetailPageLayout>
    </PageContainer>
  );
}

export function ComparePageLayout(props: ComparePageLayoutProps) {
  return (
    <SuspenseQuery>
      <CompareLayoutContent {...props} />
    </SuspenseQuery>
  );
}
