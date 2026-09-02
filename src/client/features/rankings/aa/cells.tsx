import { Check, Lightbulb, Plus } from "lucide-react";
import { useTranslation } from "@/client/providers";
import type { ArtificialAnalysisModel } from "@/shared/types";
import { modelId } from "@/client/utils/model";
import { RankingNameCell } from "@/client/components/data/columns";
import { Button } from "@/client/components/ui/button";
import { ExpandedRow } from "@/client/components/ui/card";
import { ModelDetailContent } from "@/client/features/models/model-details/aa-detail";

function ReasoningBadge({ label }: { label: string }) {
  return <Lightbulb className="size-3.5 shrink-0 text-text-tertiary" aria-label={label} />;
}

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
      className="shrink-0"
    >
      {isCompared ? <Check className="size-4" /> : <Plus className="size-4" />}
    </Button>
  );
}

export function ModelExpandedDetail({ model }: { model: ArtificialAnalysisModel }) {
  return (
    <ExpandedRow>
      <ModelDetailContent model={model} showBenchmarks={false} />
    </ExpandedRow>
  );
}

function ReasoningPrefix({ model }: { model: ArtificialAnalysisModel }) {
  const { t } = useTranslation();
  return model.is_reasoning === true ? <ReasoningBadge label={t("reasoning")} /> : null;
}

export function CompareModelCell({
  model,
  compareSet,
  onToggleCompare,
}: {
  model: ArtificialAnalysisModel;
  compareSet: Set<string>;
  onToggleCompare: (m: ArtificialAnalysisModel) => void;
}) {
  return (
    <RankingNameCell
      name={model.name || model.slug}
      prefix={<ReasoningPrefix model={model} />}
      suffix={<CompareButton model={model} isCompared={compareSet.has(modelId(model))} onToggle={onToggleCompare} />}
    />
  );
}
