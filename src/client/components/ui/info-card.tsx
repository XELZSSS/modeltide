import { memo, type ReactNode } from "react";
import { Card, CardContent } from "./card";
import { cn } from "@/client/utils";

/** Card that groups a title above a vertical stack of label/value rows. */
export const InfoCard = memo(function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent padding="md">
        <p className="text-sm font-semibold mb-3 text-text-primary">{title}</p>
        <div className="flex flex-col gap-2 min-w-0">{children}</div>
      </CardContent>
    </Card>
  );
});

/** Single label/value row for use inside an InfoCard; `compact` shrinks the text size. */
export const InfoRow = memo(function InfoRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  const textSize = compact ? "text-xs sm:text-sm" : "text-sm";
  return (
    <div className={cn("flex flex-row justify-between min-w-0 py-1.5", compact ? "gap-2" : "gap-4")}>
      <p className={cn(textSize, "text-text-secondary truncate")}>{label}</p>
      {/* div (not p): values can be links/code blocks, which must not nest inside <p>. */}
      <div className={cn(textSize, "font-mono tabular-nums text-right truncate text-text-primary font-medium min-w-0")}>
        {value}
      </div>
    </div>
  );
});
