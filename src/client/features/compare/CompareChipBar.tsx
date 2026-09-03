import { useEffect } from "react";
import { ArrowLeftRight, Trash2, X } from "lucide-react";
import { Button } from "@/client/components/ui";
import { useTranslation } from "@/client/providers";
import { modelId } from "@/client/utils";
import { useCompareStore } from "@/client/stores";
import type { ArtificialAnalysisModel } from "@/shared/types";

/** Selection bar listing chosen models with per-chip removal plus clear/compare actions. */
export function CompareChipBar({
  models,
  onRemove,
  onClear,
  onCompare,
  compareLabel,
}: {
  models: ArtificialAnalysisModel[];
  onRemove: (model: ArtificialAnalysisModel) => void;
  onClear: () => void;
  onCompare?: () => void;
  compareLabel?: string;
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
  // Comparing needs at least two models, otherwise the action stays disabled.
  const canCompare = models.length >= 2;
  return (
    <div className="flex flex-wrap gap-3 sm:gap-4 items-center justify-between">
      <div className="flex flex-wrap gap-2 items-center">
        {models.map((model, index) => (
          <span
            key={modelId(model) || `idx-${index}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-bg-card border border-border text-sm"
          >
            <span className="text-sm font-medium truncate max-w-[140px]">{model.short_name || model.name}</span>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => onRemove(model)}
              className="shrink-0 -mr-1"
              aria-label={t("removeModel", { name: model.short_name || model.name })}
            >
              <X size={14} />
            </Button>
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
      {/* Hint only makes sense when compare is offered but too few models are chosen. */}
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
