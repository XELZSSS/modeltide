import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";

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

export const ChartSkeleton = memo(function ChartSkeleton({
  height,
  className,
}: {
  height?: string;
  className?: string;
}) {
  return (
    <ChartFrame height={height}>
      <div className={cn("h-full w-full ui-skeleton", className)} />
    </ChartFrame>
  );
});

export const ChartCard = memo(function ChartCard({
  title,
  subtitle,
  loading,
  className,
  contentClassName,
  skeletonHeight,
  children,
}: {
  title?: ReactNode;
  subtitle?: ReactNode;
  loading?: boolean;
  className?: string;
  contentClassName?: string;
  skeletonHeight?: string;
  children?: ReactNode;
}) {
  return (
    <Card className={className}>
      <CardContent className={contentClassName}>
        {title != null && <CardHeader title={title} subtitle={subtitle} />}
        {loading ? <ChartSkeleton height={skeletonHeight} /> : children}
      </CardContent>
    </Card>
  );
});
