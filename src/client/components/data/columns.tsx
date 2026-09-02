import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

interface RankingNameCellProps {
  name: string;
  prefix?: React.ReactNode;
  suffix?: React.ReactNode;
  nameClassName?: string;
  gapClassName?: string;
}

export const RankingNameCell = memo(function RankingNameCell({
  name,
  prefix,
  suffix,
  nameClassName = "text-sm font-semibold",
  gapClassName = "gap-2",
}: RankingNameCellProps) {
  return (
    <div className={cn("flex items-center min-w-0", gapClassName)}>
      {prefix}
      <p className={cn("truncate flex-1 min-w-0", nameClassName)} title={name}>
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
  return { id, header, cell, align: "right", hiddenMd: false, ...opts };
}

export function rightColNA<T>(
  id: string,
  header: string,
  render: (row: T) => ReactNode | null,
  notAvailableLabel: string,
  opts?: { hiddenMd?: boolean; width?: number | string; mobilePrimary?: boolean },
): DataTableColumn<T> {
  return rightCol(
    id,
    header,
    (row) => {
      const value = render(row);
      const missing = value == null;
      return (
        <RightAlignedText className={missing ? "text-text-tertiary" : undefined}>
          {missing ? notAvailableLabel : value}
        </RightAlignedText>
      );
    },
    opts,
  );
}

export function mobilePrimaryCol<T>(
  id: string,
  header: string,
  cell: (row: T) => ReactNode,
  opts?: { hiddenMd?: boolean },
): DataTableColumn<T> {
  return { id, header, cell, align: "right", hiddenMd: false, mobilePrimary: true, ...opts };
}

export function rankCol<T>(rankOf: (row: T) => number | null | undefined): DataTableColumn<T> {
  return {
    id: "rank",
    header: "#",
    width: 76,
    hiddenMd: true,
    cell: (row) => {
      const rank = rankOf(row);
      return (
        <span className="font-mono text-sm font-semibold whitespace-nowrap tabular-nums shrink-0">{rank ?? "—"}</span>
      );
    },
  };
}

export function indexRankMap<T>(rows: T[], getId: (row: T) => string): Map<string, number> {
  return new Map(rows.map((row, i) => [getId(row), i + 1]));
}
