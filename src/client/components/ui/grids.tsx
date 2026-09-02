import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

export const SegmentedGroup = memo(function SegmentedGroup({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex gap-1 p-0.5 rounded-none border border-border bg-bg-secondary", className)} {...rest}>
      {children}
    </div>
  );
});

const CARD_GRID_COLS = { 2: "", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const;
const GRID_GAPS = { 2: "gap-2", 3: "gap-3", 4: "gap-4" } as const;

export const CardGrid = memo(function CardGrid({
  cols = 3,
  gap = 3,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  gap?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2", CARD_GRID_COLS[cols], GRID_GAPS[gap], className)}>
      {children}
    </div>
  );
});

export const DetailLayout = memo(function DetailLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
});

export const DetailSection = memo(function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-4", className)}>
      <h2 className="ui-card-title">{title}</h2>
      {children}
    </section>
  );
});

const STAT_GRID_COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" } as const;

export const StatGrid = memo(function StatGrid({
  columns = 4,
  children,
}: {
  columns?: 2 | 3 | 4;
  children: ReactNode;
}) {
  return <div className={cn("grid gap-3 sm:gap-4", STAT_GRID_COLS[columns])}>{children}</div>;
});

export const InfoGrid = memo(function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">{children}</div>;
});
