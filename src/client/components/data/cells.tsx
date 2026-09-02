import { memo } from "react";
import { cn } from "@/client/utils/cn";
import { RightAlignedText } from "@/client/components/data/columns";
import { formatDollar, formatTokens, formatPercent, formatScore } from "@/client/utils/format";
import type { TFunction } from "@/shared/i18n";

function missingClass(missing: boolean): string | undefined {
  return missing ? "text-text-tertiary" : undefined;
}

export const DollarCell = memo(function DollarCell({ value, t }: { value: number | null | undefined; t: TFunction }) {
  const missing = typeof value !== "number" || !Number.isFinite(value);
  return <RightAlignedText className={missingClass(missing)}>{formatDollar(value, t)}</RightAlignedText>;
});

export const TokensCell = memo(function TokensCell({ value, t }: { value: number | null | undefined; t: TFunction }) {
  const missing = typeof value !== "number" || !Number.isFinite(value);
  return <RightAlignedText className={missingClass(missing)}>{formatTokens(value, t)}</RightAlignedText>;
});

export const PercentCell = memo(function PercentCell({
  value,
  t,
  className,
}: {
  value: number | null | undefined;
  t: TFunction;
  className?: string;
}) {
  const missing = typeof value !== "number" || !Number.isFinite(value);
  return (
    <RightAlignedText className={cn(missingClass(missing), className)}>{formatPercent(t, value)}</RightAlignedText>
  );
});

export const ScoreCell = memo(function ScoreCell({ value, t }: { value: number | null | undefined; t: TFunction }) {
  const missing = typeof value !== "number" || !Number.isFinite(value);
  return <RightAlignedText className={missingClass(missing)}>{formatScore(t, value)}</RightAlignedText>;
});
