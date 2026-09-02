import { useId, type ReactNode } from "react";
import { cn } from "@/client/utils";

/** Section with a plain heading, optional description, and symmetric 32px vertical
 *  rhythm. It owns both margins (block-margin collapse takes the max with any
 *  preceding element's), so content placed before it never needs ad-hoc spacing. */
export function PageSection({
  title,
  description,
  children,
  className,
}: {
  title?: string;
  description?: string;
  children: ReactNode;
  className?: string;
}) {
  // Localized titles contain spaces, which would break a title-derived id/aria-labelledby
  // pair (ARIA reads the value as a space-separated id list) — useId is always valid.
  const headingId = useId();
  return (
    <section className={cn("mt-8 mb-8", className)} aria-labelledby={title ? headingId : undefined}>
      {title && (
        <div className="flex items-baseline gap-2 mb-3 sm:mb-4">
          <h2 id={headingId} className="text-base sm:text-lg font-semibold tracking-tight text-text-primary">
            {title}
          </h2>
          {description && <span className="text-xs text-text-tertiary">{description}</span>}
        </div>
      )}
      {children}
    </section>
  );
}
