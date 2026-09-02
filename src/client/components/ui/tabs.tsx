import { memo, type KeyboardEvent, type ReactNode } from "react";
import { SegmentedGroup } from "./grids";
import { cn } from "@/client/utils";

interface TabButtonProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
  id?: string;
  tabIndex?: number;
  "aria-controls"?: string;
  /**
   * ARIA role override. Defaults to "tab" for use inside a tablist (TabContainer).
   * View-mode switches (e.g. rankings/pricing toggle) must pass role="radio"
   * inside a radiogroup — a bare role="tab" outside a tablist is invalid ARIA.
   */
  role?: "tab" | "radio" | "button";
}

/** Accessible tab button; only the active tab is keyboard-focusable (roving tabindex). */
export const TabButton = memo(function TabButton({
  active,
  onClick,
  children,
  className,
  size = "md",
  id,
  tabIndex,
  "aria-controls": ariaControls,
  role = "tab",
}: TabButtonProps) {
  const checkedProps =
    role === "tab"
      ? { "aria-selected": active, tabIndex: tabIndex ?? (active ? 0 : -1) }
      : role === "radio"
        ? { "aria-checked": active, tabIndex: tabIndex ?? 0 }
        : { "aria-pressed": active, tabIndex: tabIndex ?? 0 };
  return (
    <button
      type="button"
      role={role}
      id={id}
      aria-controls={ariaControls}
      {...checkedProps}
      onClick={onClick}
      className={cn(
        "rounded-md font-medium transition-colors duration-150 whitespace-nowrap shrink-0",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        active ? "bg-bg-card text-text-primary shadow-sm" : "text-text-secondary hover:text-text-primary",
        "outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1",
        className,
      )}
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
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

/**
 * Tab list with keyboard navigation (arrow keys wrap around and move focus) and ARIA wiring.
 * `children` is the panel content for the currently active tab.
 */
export function TabContainer({ tabs, activeTab, className, tabSize = "md", onTabChange, children }: TabContainerProps) {
  const handleTablistKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (tabs.length === 0) return;
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    if (currentIndex < 0) return;
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    }
    if (nextIndex == null) return;
    event.preventDefault();
    onTabChange(tabs[nextIndex]!.id);
    document.getElementById(`tab-${tabs[nextIndex]!.id}`)?.focus();
  };

  return (
    <div className={cn("flex flex-col gap-4 sm:gap-5", className)}>
      <SegmentedGroup
        className="p-1 w-fit max-w-full overflow-x-auto no-scrollbar"
        role="tablist"
        onKeyDown={handleTablistKeyDown}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            active={activeTab === tab.id}
            onClick={() => onTabChange(tab.id)}
            size={tabSize}
            tabIndex={activeTab === tab.id ? 0 : -1}
            aria-controls={activeTab === tab.id ? `panel-${tab.id}` : undefined}
            id={`tab-${tab.id}`}
          >
            {tab.label}
          </TabButton>
        ))}
      </SegmentedGroup>
      <div role="tabpanel" id={`panel-${activeTab}`} aria-labelledby={`tab-${activeTab}`}>
        {children}
      </div>
    </div>
  );
}
