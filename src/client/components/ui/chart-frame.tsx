"use client";
import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";

/**
 * Fixed-height box every chart renders in. The `figure` is full-height and the
 * canvas is forced to `display: block` so Chart.js never picks up the inline
 * baseline gap; `height` carries the per-chart sizing (default 200/240px).
 */
export const ChartFrame = memo(function ChartFrame({
  height = "h-[200px] sm:h-[240px]",
  children,
}: {
  height?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("w-full min-w-0 overflow-hidden", height)}>
      <figure className="h-full [&_canvas]:block">{children}</figure>
    </div>
  );
});
