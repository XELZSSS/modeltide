"use client";
import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

export const SegmentedGroup = memo(function SegmentedGroup({
  className,
  children,
  ...rest
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "inline-flex max-w-full items-center gap-0.5 p-1 rounded-none border border-border bg-bg-secondary",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
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
  // Legacy alias: keep API stable, visuals aligned with PageSection.
  return (
    <section className={cn("flex flex-col gap-3 sm:gap-4", className)} aria-label={title}>
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
