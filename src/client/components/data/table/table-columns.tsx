import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

interface RankingNameCellProps {
  name: string;
  title?: string;
  suffix?: React.ReactNode;
}

export const RankingNameCell = memo(function RankingNameCell({ name, title, suffix }: RankingNameCellProps) {
  return (
    <div className="flex items-center min-w-0 gap-2">
      <p className="truncate flex-1 min-w-0 ui-body font-medium" title={title ?? name}>
        {name || "—"}
      </p>
      {suffix}
    </div>
  );
});

interface RightAlignedTextProps {
  children: ReactNode;
  className?: string;
}

export const RightAlignedText = memo(function RightAlignedText({ children, className }: RightAlignedTextProps) {
  return <p className={cn("overflow-hidden text-ellipsis whitespace-nowrap text-right", className)}>{children}</p>;
});

export interface DataTableColumn<T> {
  id: string;
  header?: string;
  cell: (row: T) => ReactNode;
  align?: "left" | "center" | "right";
  width?: number | string;
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
}

interface ColOpts {
  width?: number | string;
  hiddenMd?: boolean;
  mobilePrimary?: boolean;
  align?: "left" | "center" | "right";
}

export function col<T>(id: string, header: string, cell: (row: T) => ReactNode, opts?: ColOpts): DataTableColumn<T> {
  return { id, header, cell, align: opts?.align ?? "left", ...opts };
}

/** Trend color for the ranking tables; `zeroAsSuccess` is the arena board's ≥0-is-green convention. */
export function trendClass(change: number | null | undefined, zeroAsSuccess = false): string {
  if (change == null || change === 0) return zeroAsSuccess ? "text-success" : "text-text-tertiary";
  return change > 0 ? "text-success" : "text-destructive";
}

export function rightCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean; width?: number | string },
): DataTableColumn<T> {
  return col(id, header, cell, { ...opts, align: "right" });
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return col(id, header, cell, { ...opts, align: "right", mobilePrimary: true });
}

const MONO_EMPHASIS_CLASS = {
  strong: "ui-mono-value font-semibold",
  muted: "ui-mono-value font-normal text-text-secondary",
} as const;

export function monoCol<T>(
  id: string,
  header: string,
  format: (row: T) => ReactNode,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean; emphasis?: keyof typeof MONO_EMPHASIS_CLASS },
): DataTableColumn<T> {
  const alignCol = opts?.mobilePrimary ? mobilePrimaryCol : rightCol;
  const className = opts?.emphasis ? MONO_EMPHASIS_CLASS[opts.emphasis] : "ui-mono-value";
  return alignCol(
    id,
    header,
    (row) => <span className={className}>{format(row)}</span>,
    opts?.hiddenMd ? { hiddenMd: true } : undefined,
  );
}

export interface RowListProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  getRowName?: (row: T) => string;
  isExpandable: boolean;
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => React.ReactNode;
}
