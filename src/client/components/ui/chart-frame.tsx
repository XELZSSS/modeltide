import { memo, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";
import { Card, CardContent, CardHeader } from "@/client/components/ui/card";

/** Fixed-height box for every chart: the canvas is forced to `display: block` so Chart.js never
 *  picks up the inline baseline gap. */
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

export const ChartSkeleton = memo(function ChartSkeleton({ height }: { height?: string }) {
  return (
    <ChartFrame height={height}>
      <div className="h-full w-full ui-skeleton" />
    </ChartFrame>
  );
});

export const ChartEmpty = memo(function ChartEmpty({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex items-center justify-center text-center ui-body-secondary", className)} role="status">
      {children}
    </div>
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
