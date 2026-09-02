import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils";

interface RankingNameCellProps {
  name: string;
  /** Optional leading element (e.g. a reasoning badge). */
  prefix?: React.ReactNode;
  /** Optional trailing element (e.g. a compare toggle chip). */
  suffix?: React.ReactNode;
  /** Typography of the name; defaults to the semibold ranking look. */
  nameClassName?: string;
  /** Gap between prefix/name/suffix; defaults to gap-2. */
  gapClassName?: string;
}

/** Model name cell for ranking rows; truncates and can carry leading/trailing elements. */
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
      <p className={cn("truncate flex-1 min-w-0", nameClassName)}>{name || "—"}</p>
      {suffix}
    </div>
  );
});

interface RightAlignedTextProps {
  children: ReactNode;
  className?: string;
}

/** Right-aligned text that ellipsizes instead of wrapping, for table/value columns. */
export const RightAlignedText = memo(function RightAlignedText({ children, className }: RightAlignedTextProps) {
  return <p className={cn("overflow-hidden text-ellipsis whitespace-nowrap text-right", className)}>{children}</p>;
});
