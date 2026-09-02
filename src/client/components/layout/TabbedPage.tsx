import { type ReactNode } from "react";
import { TabContainer, type TabItem } from "@/client/components/ui";
import { PageContainer } from "./PageContainer";
import { PageHeader } from "./PageHeader";

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
