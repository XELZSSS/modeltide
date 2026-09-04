import { useEffect, useMemo, type ReactNode } from "react";
import { useNavigate } from "react-router";
import { ArrowLeftRight, Trash2, X } from "lucide-react";
import { Button } from "@/client/components/ui";
import { BackButton, Spinner } from "@/client/components/shared";
import { useTranslation } from "@/client/providers";
import { useCompareStore, useCompareModels } from "@/client/stores";
import { useArtificialRankings } from "@/client/api/queries";
import { modelId } from "@/client/utils";
import type { TranslationKey } from "@/shared/i18n";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { PageContainer, PageHeader } from "@/client/components/layout";

function useComparedModelsOrNull(): ArtificialAnalysisModel[] | null {
  const rankingsQ = useArtificialRankings();
  const models = useCompareModels(rankingsQ.data ?? []);
  return useMemo(() => {
    // A failed query resolves to "no models", not a permanent spinner.
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
          <Button size="sm" variant="outline" onClick={() => navigate(backTo, { state: backState })}>
            {t("backToList")}
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer>
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

// ---- CompareChipBar ----
/** Selection bar with per-chip removal plus clear/compare actions. */
export function CompareChipBar({
  models,
  onRemove,
  onClear,
  onCompare,
  compareLabel,
  leading,
}: {
  models: ArtificialAnalysisModel[];
  onRemove: (model: ArtificialAnalysisModel) => void;
  onClear: () => void;
  onCompare?: () => void;
  compareLabel?: string;
  leading?: ReactNode;
}) {
  const { t } = useTranslation();
  const lastExceedAt = useCompareStore((s) => s.lastExceedAt);
  const clearExceed = useCompareStore((s) => s.clearExceed);
  const showLimit = lastExceedAt !== null;
  useEffect(() => {
    if (lastExceedAt == null) return;
    const timer = setTimeout(() => clearExceed(), 2500);
    return () => clearTimeout(timer);
  }, [lastExceedAt, clearExceed]);
  // Comparing needs at least two models.
  const canCompare = models.length >= 2;
  return (
    <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between">
      <div className="flex flex-wrap gap-2 items-center">
        {leading}
        {models.map((model, index) => (
          <span
            key={modelId(model) || `idx-${index}`}
            className="inline-flex items-center gap-2 pl-3 pr-1.5 py-1.5 rounded-md bg-bg-card border border-border text-sm"
          >
            <span className="font-medium truncate max-w-36">{model.short_name || model.name}</span>
            <button
              type="button"
              onClick={() => onRemove(model)}
              aria-label={t("removeModel", { name: model.short_name || model.name })}
              className="shrink-0 p-1.5 rounded-md text-text-secondary hover:text-text-primary hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
            >
              <X size={14} />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <Button size="sm" variant="outline" onClick={onClear} className="flex-1 sm:flex-none">
          <Trash2 size={14} /> {t("clear")}
        </Button>
        {onCompare && (
          <Button
            size="sm"
            variant="outline"
            onClick={onCompare}
            disabled={!canCompare}
            className="flex-1 sm:flex-none"
          >
            <ArrowLeftRight size={14} /> {compareLabel ?? t("compareSelected")}
          </Button>
        )}
      </div>
      {/* Hint only when compare is offered but too few models are chosen. */}
      {onCompare && !canCompare && models.length > 0 && (
        <p className="text-xs text-text-secondary w-full">{t("compareLimit")}</p>
      )}
      {showLimit && (
        <p className="text-xs text-warning w-full animate-fade-in" role="alert" aria-live="polite">
          {t("compareLimitTwo")}
        </p>
      )}
    </div>
  );
}
