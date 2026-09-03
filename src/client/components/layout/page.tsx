import { useId, type ReactNode } from "react";
import { cn } from "@/client/utils";
import { TabContainer, type TabItem } from "@/client/components/ui";

/** Centred page wrapper with a max-width and responsive horizontal padding. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6", className)}>{children}</div>;
}

/** Page title block: stacks on mobile, becomes a row with actions on wider screens. */
export function PageHeader({
  title,
  description,
  actions,
  compact,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
}) {
  return (
    <header
      className={cn(
        "flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-4",
        compact ? "mb-4" : "mb-5 sm:mb-6",
      )}
    >
      <div>
        <h1
          className={cn(
            "font-semibold tracking-tight text-text-primary break-words min-w-0",
            compact ? "text-lg sm:text-xl" : "text-xl sm:text-2xl",
          )}
        >
          {title}
        </h1>
        {description && (
          <p className={cn("text-text-secondary mt-1", compact ? "text-xs sm:text-sm" : "text-sm")}>{description}</p>
        )}
      </div>
      {actions && <div className="flex w-full sm:w-auto items-center gap-2 sm:shrink-0">{actions}</div>}
    </header>
  );
}

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

interface TabbedPageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  /** Compact header sizing for dense hubs. */
  compact?: boolean;
  containerClassName?: string;
  /** Optional result-count line rendered between the header and the tabs. */
  countLabel?: string;
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tabSize?: "sm" | "md";
  tabClassName?: string;
  children: ReactNode;
}

/** Standard tabbed page scaffold: PageContainer + PageHeader (+ optional count line) + TabContainer. */
export function TabbedPage({
  title,
  description,
  actions,
  compact,
  containerClassName,
  countLabel,
  tabs,
  activeTab,
  onTabChange,
  tabSize = "sm",
  tabClassName,
  children,
}: TabbedPageProps) {
  return (
    <PageContainer className={containerClassName}>
      <PageHeader compact={compact} title={title} description={description} actions={actions} />
      {countLabel && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-text-tertiary">{countLabel}</span>
        </div>
      )}
      <TabContainer
        tabs={tabs}
        activeTab={activeTab}
        tabSize={tabSize}
        className={tabClassName}
        onTabChange={onTabChange}
      >
        {children}
      </TabContainer>
    </PageContainer>
  );
}
