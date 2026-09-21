"use client";
import { useId, type ReactNode } from "react";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/client/utils/cn";
import { TabContainer, type TabItem } from "@/client/components/ui/tabs";
import { Card, CardContent } from "@/client/components/ui/card";
import { Button } from "@/client/components/ui/button";
import { useRouter } from "@/client/router";
import { useTranslation } from "@/client/providers";
import type { TranslationKey } from "@/shared/i18n";

export function BackButton({ labelKey, to }: { labelKey: TranslationKey; to: string }) {
  const router = useRouter();
  const { t } = useTranslation();
  const goBack = () => {
    const raw = typeof window !== "undefined" ? (window.history.state as { idx?: unknown } | null)?.idx : undefined;
    const idx = typeof raw === "number" && Number.isInteger(raw) ? raw : undefined;
    if (idx != null && idx > 0) router.back();
    // replace, not push: no extra history entry for a direct landing.
    else router.replace(to);
  };
  return (
    <Button size="sm" variant="outline" onClick={goBack} className="self-start">
      <ArrowLeft className="size-4" /> {t(labelKey)}
    </Button>
  );
}

export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-7xl mx-auto px-5 sm:px-8 lg:px-10 py-8 sm:py-12", className)}>{children}</div>;
}

export function PageHeader({
  title,
  description,
  actions,
  compact,
  kicker,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  kicker?: string;
}) {
  return (
    <header
      className={cn("flex flex-col sm:flex-row sm:items-end justify-between gap-4", compact ? "mb-6" : "mb-8 sm:mb-12")}
    >
      <div className="min-w-0">
        {kicker && <p className="ui-kicker mb-3">{kicker}</p>}
        <h1 className={compact ? "text-xl sm:text-2xl font-semibold tracking-tight" : "ui-page-title"}>{title}</h1>
        {description && <p className="ui-body-secondary mt-3 max-w-2xl text-balance">{description}</p>}
      </div>
      {actions && (
        <div className="flex w-full sm:w-auto min-w-0 max-w-full items-center gap-2 sm:shrink-0">{actions}</div>
      )}
    </header>
  );
}

export function DetailPageLayout({
  backLabelKey,
  backTo,
  title,
  description,
  compact,
  children,
}: {
  backLabelKey: TranslationKey;
  backTo: string;
  title: string;
  description?: string;
  compact?: boolean;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5 min-w-0 animate-fade-in">
      <BackButton labelKey={backLabelKey} to={backTo} />
      <PageHeader compact={compact} title={title} description={description} />
      <div className="flex flex-col gap-4 sm:gap-5">{children}</div>
    </div>
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
    return <div className={cn("my-8 sm:my-10", className)}>{children}</div>;
  }
  return (
    <section className={cn("my-8 sm:my-10 first:mt-0 last:mb-0", className)} aria-labelledby={headingId}>
      <div className="flex items-baseline justify-between gap-2 mb-4 sm:mb-6">
        <h2 id={headingId} className="ui-section-title">
          {title}
        </h2>
        {description && <span className="ui-meta shrink-0">{description}</span>}
      </div>
      {children}
    </section>
  );
}

interface TabbedPageProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  compact?: boolean;
  kicker?: string;
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
  kicker,
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
      <PageHeader compact={compact} title={title} description={description} actions={actions} kicker={kicker} />
      {countLabel && (
        <div className="flex items-center gap-2 -mt-2 mb-4">
          <span className="ui-meta tabular-nums">{countLabel}</span>
        </div>
      )}
      <TabContainer
        tabs={tabs}
        activeTab={activeTab}
        tabSize={tabSize}
        fill={tabFill}
        onTabChange={onTabChange}
        ariaLabel={title}
      >
        {children}
      </TabContainer>
    </PageContainer>
  );
}

export function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <PageSection title={title}>
      <Card>
        <CardContent>{children}</CardContent>
      </Card>
    </PageSection>
  );
}
