import type { MouseEvent as ReactMouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/providers";
import { Button } from "@/client/components/ui/button";

function expandToggleProps(isExpanded: boolean, toggle: () => void, label: string) {
  return {
    "aria-expanded": isExpanded,
    "aria-label": label,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      toggle();
    },
  } as const;
}

export function ExpandToggle({
  isExpanded,
  onToggle,
  size = 14,
}: {
  isExpanded: boolean;
  onToggle: () => void;
  size?: number;
}) {
  const { t } = useTranslation();
  return (
    <Button
      variant="ghost"
      size="icon"
      className="shrink-0 size-7"
      {...expandToggleProps(isExpanded, onToggle, isExpanded ? t("collapseRow") : t("expandRow"))}
    >
      <span className={cn("shrink-0 text-text-secondary transition-transform duration-200", isExpanded && "rotate-90")}>
        <ChevronRight size={size} />
      </span>
    </Button>
  );
}

export function getRowExpandState<T>(
  row: T,
  getRowId: (row: T) => string,
  expandedRowId: string | null | undefined,
  onToggleExpand: ((rowId: string | null) => void) | undefined,
) {
  const rowId = getRowId(row);
  const isExpanded = expandedRowId === rowId;
  const toggle = () => onToggleExpand?.(isExpanded ? null : rowId);
  return { rowId, isExpanded, toggle };
}
