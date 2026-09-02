import type { ReactNode } from "react";
import { cn } from "@/client/utils";

/** Pill-group container used to visually group segmented controls (e.g. tabs). */
export function SegmentedGroup({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex gap-1 p-0.5 rounded-lg bg-bg-secondary", className)} {...rest}>
      {children}
    </div>
  );
}

/**
 * Responsive card grid: 1 column on mobile, 2 from `sm`, and up to `cols` on `lg`.
 */
export function CardGrid({
  cols = 3,
  gap = 2,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  gap?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid grid-cols-1 sm:grid-cols-2",
        cols === 3 && "lg:grid-cols-3",
        cols === 4 && "lg:grid-cols-4",
        gap === 2 && "gap-2",
        gap === 3 && "gap-3",
        gap === 4 && "gap-4",
        className,
      )}
    >
      {children}
    </div>
  );
}

/** Vertical stack with consistent spacing used for detail pages. */
export function DetailLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/**
 * Flat titled section for detail pages. Use it for low-density content (a row
 * of stat cards, badges, a paragraph) instead of wrapping it in another Card,
 * so detail pages don't stack boxes inside boxes.
 */
export function DetailSection({
  title,
  children,
  className,
}: {
  title: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("flex flex-col gap-3", className)}>
      <h2 className="text-sm font-semibold text-text-primary">{title}</h2>
      {children}
    </section>
  );
}

/**
 * Statistic grid. Note `columns={4}` renders 2 columns on mobile and 4 from `md` up,
 * so stat cards stay readable on narrow screens.
 */
export function StatGrid({ columns = 4, children }: { columns?: 2 | 3 | 4; children: ReactNode }) {
  return (
    <div
      className={cn(
        "grid gap-3 sm:gap-4",
        columns === 2 && "grid-cols-2",
        columns === 3 && "grid-cols-3",
        columns === 4 && "grid-cols-2 md:grid-cols-4",
      )}
    >
      {children}
    </div>
  );
}

/** Two-column grid on desktop, single column on mobile, for label/value card pairs. */
export function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">{children}</div>;
}
