"use client";
import { memo, type ReactNode, type KeyboardEvent } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/client/utils/cn";
import { SegmentedGroup } from "@/client/components/ui/grids";

const tabButtonVariants = cva(
  "rounded-none font-medium transition-colors duration-fast whitespace-nowrap shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none",
  {
    variants: {
      active: {
        true: "bg-bg-card text-text-primary ring-1 ring-inset ring-border shadow-xs",
        false: "text-text-secondary hover:text-text-primary hover:bg-hover/60",
      },
      size: {
        sm: "px-3 py-1.5 text-xs",
        md: "px-4 py-2 text-sm",
      },
    },
    defaultVariants: { active: false, size: "md" },
  },
);

interface TabButtonProps extends VariantProps<typeof tabButtonVariants> {
  onClick: () => void;
  children: ReactNode;
  className?: string;
  id?: string;
  tabIndex?: number;
  "aria-controls"?: string;
  role?: "tab" | "radio";
}

function tabAriaProps(
  role: NonNullable<TabButtonProps["role"]>,
  active: boolean | undefined,
  tabIndex: number | undefined,
) {
  if (role === "tab") return { "aria-selected": active, tabIndex: tabIndex ?? (active ? 0 : -1) };
  return { "aria-checked": active, tabIndex: tabIndex ?? 0 };
}

export const TabButton = memo(function TabButton({
  active,
  onClick,
  children,
  className,
  size,
  id,
  tabIndex,
  "aria-controls": ariaControls,
  role = "tab",
}: TabButtonProps) {
  const checkedProps = tabAriaProps(role, active ?? undefined, tabIndex);
  return (
    <button
      type="button"
      role={role}
      id={id}
      aria-controls={ariaControls}
      {...checkedProps}
      onClick={onClick}
      className={cn(tabButtonVariants({ active, size }), className)}
    >
      {children}
    </button>
  );
});

export interface TabItem {
  id: string;
  label: string;
}

interface TabContainerProps {
  tabs: TabItem[];
  activeTab: string;
  className?: string;
  tabSize?: "sm" | "md";
  fill?: boolean;
  role?: "tablist" | "radiogroup";
  ariaLabel?: string;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

export const TabContainer = memo(function TabContainer({
  tabs,
  activeTab,
  className,
  tabSize = "md",
  fill,
  role = "tablist",
  ariaLabel,
  onTabChange,
  children,
}: TabContainerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = tabs.length - 1;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    onTabChange(tabs[nextIndex]!.id);
    document.getElementById(`tab-${tabs[nextIndex]!.id}`)?.focus();
  };

  const buttonRole = role === "radiogroup" ? "radio" : "tab";

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <SegmentedGroup
        className={cn("w-fit max-w-full overflow-x-auto no-scrollbar sm:flex-wrap", fill && "w-full sm:w-full")}
        role={role}
        aria-label={ariaLabel}
        onKeyDown={handleKeyDown}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            className={fill ? "flex-1 sm:flex-auto sm:shrink sm:text-center" : undefined}
            active={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            size={tabSize}
            role={buttonRole}
            tabIndex={activeTab === tab.id ? 0 : role === "radiogroup" ? 0 : -1}
            aria-controls={`panel-${tab.id}`}
            id={`tab-${tab.id}`}
          >
            {tab.label}
          </TabButton>
        ))}
      </SegmentedGroup>
      <div
        role="tabpanel"
        id={`panel-${activeTab}`}
        aria-labelledby={`tab-${activeTab}`}
        tabIndex={0}
        className="min-w-0 animate-fade-in"
        key={activeTab}
      >
        {children}
      </div>
    </div>
  );
});
