"use client";
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

/** Canonical model-name cell; modelNameCol in ranked.tsx delegates to it. */
export const ModelNameCell = RankingNameCell;

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

export function textCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { width?: number | string },
): DataTableColumn<T> {
  return { id, header, cell, ...opts };
}

export function rightCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean; width?: number | string },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", ...opts };
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", mobilePrimary: true, ...opts };
}

export function monoCol<T>(
  id: string,
  header: string,
  format: (row: T) => ReactNode,
  opts?: { mobilePrimary?: boolean; hiddenMd?: boolean },
): DataTableColumn<T> {
  const col = opts?.mobilePrimary ? mobilePrimaryCol : rightCol;
  return col(
    id,
    header,
    (row) => <span className="ui-mono-value">{format(row)}</span>,
    opts?.hiddenMd ? { hiddenMd: true } : undefined,
  );
}

interface CompareCellProps {
  align?: "left" | "right";
  className?: string;
  style?: React.CSSProperties;
  children?: ReactNode;
}

export const CompareTh = memo(function CompareTh({
  align = "left",
  className,
  style,
  children,
  scope,
}: CompareCellProps & { scope?: "col" | "row" }) {
  return (
    <th
      scope={scope}
      className={cn(
        "px-4 py-3 text-xs font-medium text-text-tertiary",
        align === "right" ? "text-right" : "text-left",
        className,
      )}
      style={style}
    >
      {children}
    </th>
  );
});

export const CompareTd = memo(function CompareTd({
  align = "left",
  mono,
  className,
  style,
  children,
}: CompareCellProps & { mono?: boolean }) {
  return (
    <td
      className={cn(
        "px-4 py-3 text-sm",
        mono && "font-mono tabular-nums",
        align === "right" && "text-right",
        className,
      )}
      style={style}
    >
      {children}
    </td>
  );
});

export const CompareTr = memo(function CompareTr({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLTableRowElement>) {
  return (
    <tr className={cn("border-b border-border last:border-b-0", className)} {...props}>
      {children}
    </tr>
  );
});

export interface RowListProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  isExpandable: boolean;
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => React.ReactNode;
}
