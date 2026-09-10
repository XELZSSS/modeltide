"use client";
import { useId, type ReactNode } from "react";
import { cn } from "@/client/utils/cn";
import { TabContainer, type TabItem } from "@/client/components/ui/tabs";

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5", className)}>{children}</div>;
}

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
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        compact ? "mb-4" : "mb-4 sm:mb-5",
      )}
    >
      <div className="min-w-0">
        <h1 className={cn(compact ? "text-lg sm:text-xl" : "ui-page-title")}>{title}</h1>
        {description && <p className="ui-body-secondary mt-1.5">{description}</p>}
      </div>
      {actions && (
        <div className="flex w-full sm:w-auto min-w-0 max-w-full items-center gap-2 sm:shrink-0">{actions}</div>
      )}
    </header>
  );
}

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
  const headingId = useId();
  if (!title) {
    return <div className={cn("my-4 sm:my-6", className)}>{children}</div>;
  }
  return (
    <section className={cn("my-4 sm:my-6", className)} aria-labelledby={headingId}>
      {title && (
        <div className="flex items-baseline gap-2 mb-3 sm:mb-4">
          <h2 id={headingId} className="ui-section-title">
            {title}
          </h2>
          {description && <span className="ui-meta">{description}</span>}
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
  compact?: boolean;
  countLabel?: string;
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tabSize?: "sm" | "md";
  tabFill?: boolean;
  children: ReactNode;
}

export function TabbedPage({
  title,
  description,
  actions,
  compact,
  countLabel,
  tabs,
  activeTab,
  onTabChange,
  tabSize = "sm",
  tabFill,
  children,
}: TabbedPageProps) {
  return (
    <PageContainer>
      <PageHeader compact={compact} title={title} description={description} actions={actions} />
      {countLabel && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-text-tertiary">{countLabel}</span>
        </div>
      )}
      <TabContainer tabs={tabs} activeTab={activeTab} tabSize={tabSize} fill={tabFill} onTabChange={onTabChange}>
        {children}
      </TabContainer>
    </PageContainer>
  );
}
