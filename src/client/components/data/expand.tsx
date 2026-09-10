"use client";
import { ChevronRight } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { useTranslation } from "@/client/providers";
import { Button } from "@/client/components/ui/button";

export function ExpandToggle({
  isExpanded,
  onToggle,
  size = 14,
  controlsId,
}: {
  isExpanded: boolean;
  onToggle: () => void;
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
      aria-label={isExpanded ? t("collapseRow") : t("expandRow")}
      {...(controlsId ? { "aria-controls": controlsId } : {})}
      onClick={(e) => {
        e.stopPropagation();
        onToggle();
      }}
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
