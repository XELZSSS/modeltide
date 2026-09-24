import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { Button } from "@/client/components/ui/button";
import { cn } from "@/client/utils/cn";

export function ExpandToggle({
  isExpanded,
  onToggle,
  rowName,
  size = 14,
  controlsId,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  rowName: string;
  size?: number;
  controlsId?: string;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 size-7"
      aria-expanded={isExpanded}
      aria-label={`${isExpanded ? t("collapseRow") : t("expandRow")} ${rowName}`}
      {...(controlsId ? { "aria-controls": controlsId } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
    >
      <span
        className={cn("shrink-0 text-text-secondary transition-transform duration-fast", isExpanded && "rotate-90")}
      >
        <ChevronRight size={size} />
      </span>
    </Button>
  );
}
