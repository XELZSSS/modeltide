"use client";
import { memo, useEffect, type ReactNode } from "react";
import { ArrowLeftRight, Trash2, X } from "lucide-react";
import { Button } from "@/client/components/ui/button";
import { useTranslation } from "@/client/providers";
import { useCompareStore } from "@/client/stores";
import { modelId } from "@/client/utils/model";
import type { ArtificialAnalysisModel } from "@/shared/types";

const CompareChip = memo(function CompareChip({
  model,
  onRemove,
}: {
  model: ArtificialAnalysisModel;
  onRemove: (m: ArtificialAnalysisModel) => void;
}) {
  const { t } = useTranslation();
  const name = model.short_name || model.name;
  return (
    <span className="inline-flex items-center gap-1 pl-3 pr-1 py-1 rounded-none bg-bg-secondary/60 border border-border text-sm transition-colors duration-fast hover:border-text-tertiary/40">
      <span className="font-medium truncate max-w-36">{name}</span>
      <button
        type="button"
        onClick={() => onRemove(model)}
        aria-label={t("removeModel", { name })}
        className="shrink-0 p-1 rounded-none text-text-secondary hover:text-text-primary hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X size={14} />
      </button>
    </span>
  );
});

export const CompareChipBar = memo(function CompareChipBar({
  models,
  onRemove,
  onClear,
  onCompare,
  leading,
}: {
  models: ArtificialAnalysisModel[];
  onRemove: (model: ArtificialAnalysisModel) => void;
  onClear: () => void;
  onCompare?: () => void;
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
  const canCompare = models.length >= 2;
  return (
    <div className="flex flex-wrap gap-3 items-center justify-between border border-border bg-bg-card px-3 py-2.5">
      <div className="flex flex-wrap gap-2 items-center min-w-0">
        {leading}
        {models.map((model, index) => (
          <CompareChip key={modelId(model) || `idx-${index}`} model={model} onRemove={onRemove} />
        ))}
      </div>
      <div className="flex gap-2 w-full sm:w-auto">
        <Button size="sm" variant="outline" onClick={onClear} className="flex-1 sm:flex-none">
          <Trash2 size={14} /> {t("clear")}
        </Button>
        {onCompare && (
          <Button
            size="sm"
            variant={canCompare ? "primary" : "outline"}
            onClick={onCompare}
            disabled={!canCompare}
            className="flex-1 sm:flex-none"
          >
            <ArrowLeftRight size={14} /> {t("compareSelected")}
          </Button>
        )}
      </div>
      {onCompare && !canCompare && models.length > 0 && <p className="ui-caption w-full">{t("compareLimit")}</p>}
      {showLimit && (
        <p className="ui-caption text-warning w-full animate-fade-in" role="alert" aria-live="polite">
          {t("compareLimitTwo")}
        </p>
      )}
    </div>
  );
});
