"use client";
import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

interface RankingNameCellProps {
  name: string;
  suffix?: React.ReactNode;
}

export const RankingNameCell = memo(function RankingNameCell({ name, suffix }: RankingNameCellProps) {
  return (
    <div className="flex items-center min-w-0 gap-2">
      <p className="truncate flex-1 min-w-0 ui-body font-medium" title={name}>
        {name || "—"}
      </p>
      {suffix}
    </div>
  );
});

/** Canonical model-name cell alias (replaces ad-hoc modelNameCol/ReleaseModelCell variants). */
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

export function rankCol<T>(rankOf: (row: T) => number | null | undefined): DataTableColumn<T> {
  return {
    id: "rank",
    header: "",
    width: 56,
    hiddenMd: true,
    cell: (row) => {
      const rank = rankOf(row);
      return <span className="ui-mono-value font-semibold whitespace-nowrap shrink-0">{rank ?? "—"}</span>;
    },
  };
}

export function indexRankMap<T>(rows: T[], getId: (row: T) => string): Map<string, number> {
  return new Map(rows.map((row, i) => [getId(row), i + 1]));
}

export interface RowListProps<T> {
  pagedData: T[];
  columns: DataTableColumn<T>[];
  getRowId: (row: T) => string;
  isExpandable: boolean;
  expandedRowId?: string | null;
  onToggleExpand?: (rowId: string | null) => void;
  renderExpandedRow?: (row: T) => React.ReactNode;
}
