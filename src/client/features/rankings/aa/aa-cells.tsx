import { memo } from "react";
import { Check, Plus } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { cn } from "@/client/utils/cn";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelId } from "@/client/utils/model-utils";
import { useCompareStore } from "@/client/stores";
import { RankingNameCell } from "@/client/components/data/table/table-columns";
import { Button } from "@/client/components/ui/button";
import { ModelDetailContent } from "@/client/features/models/model-details/aa-detail";

function CompareButton({
  model,
  isCompared,
  onToggle,
}: {
  model: ArtificialAnalysisModel;
  isCompared: boolean;
  onToggle: (m: ArtificialAnalysisModel) => void;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label={isCompared ? t("removeFromCompare") : t("addToCompare")}
      aria-pressed={isCompared}
      onClick={(e) => {
        e.stopPropagation();
        onToggle(model);
      }}
      className={cn("shrink-0", isCompared ? "text-accent" : "text-text-secondary")}
    >
      {isCompared ? <Check className="size-4" /> : <Plus className="size-4" />}
    </Button>
  );
}

export function ModelExpandedDetail({ model }: { model: ArtificialAnalysisModel }) {
  return (
    <div className="p-4 sm:p-5">
      <ModelDetailContent model={model} showBenchmarks={false} />
    </div>
  );
}

export const CompareModelCell = memo(function CompareModelCell({ model }: { model: ArtificialAnalysisModel }) {
  const id = modelId(model);
  const isCompared = useCompareStore((s) => s.compareIds.includes(id));
  const onToggleCompare = useCompareStore((s) => s.toggleCompareModel);
  return (
    <RankingNameCell
      name={model.name || model.slug}
      suffix={<CompareButton model={model} isCompared={isCompared} onToggle={onToggleCompare} />}
    />
  );
});
