import { type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from "react";
import { ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { cn } from "@/client/utils";

/** True if the click/keydown originated in an interactive element. */
export function isFromInteractive(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest("button, a, input, select, textarea") !== null;
}

/** Deterministic content-based row id used when no getRowId is provided. */
function rowContentId(row: unknown): string {
  const json = JSON.stringify(row);
  let hash = 0;
  for (let i = 0; i < json.length; i++) {
    hash = (hash * 31 + json.charCodeAt(i)) | 0;
  }
  return `row-${(hash >>> 0).toString(36)}`;
}

/** Props for the expand toggle button (chevron). */
function expandToggleProps(isExpanded: boolean, toggle: () => void, label: string) {
  return {
    "aria-expanded": isExpanded,
    "aria-label": label,
    onClick: (e: ReactMouseEvent) => {
      e.stopPropagation();
      toggle();
    },
    onKeyDown: (e: ReactKeyboardEvent) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        e.stopPropagation();
        toggle();
      }
    },
  } as const;
}

/** Reusable expand/collapse toggle button with rotating chevron. */
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
    <button
      type="button"
      className="shrink-0 p-0.5 -m-0.5 rounded hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/50"
      {...expandToggleProps(isExpanded, onToggle, isExpanded ? t("collapseRow") : t("expandRow"))}
    >
      <Chevron isExpanded={isExpanded} size={size} />
    </button>
  );
}

/** Rotating disclosure chevron. */
function Chevron({ isExpanded, size }: { isExpanded: boolean; size: number }) {
  return (
    <span className={cn("shrink-0 text-text-secondary transition-transform duration-200", isExpanded && "rotate-90")}>
      <ChevronRight size={size} />
    </span>
  );
}

/** Shared row expand state. */
export function getRowExpandState<T>(
  row: T,
  getRowId: ((row: T) => string) | undefined,
  expandedRowId: string | null | undefined,
  onToggleExpand: ((rowId: string | null) => void) | undefined,
) {
  const rowId = getRowId?.(row) ?? rowContentId(row);
  const isExpanded = expandedRowId === rowId;
  const toggle = () => onToggleExpand?.(isExpanded ? null : rowId);
  return { rowId, isExpanded, toggle };
}
