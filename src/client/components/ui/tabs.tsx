import { memo, type ReactNode, type KeyboardEvent } from "react";
import { cn } from "@/client/utils/cn";
import { SegmentedGroup } from "@/client/components/ui/grids";

interface TabButtonProps {
  active?: boolean;
  onClick: () => void;
  children: ReactNode;
  className?: string;
  size?: "sm" | "md";
  id?: string;
  tabIndex?: number;
  "aria-controls"?: string;
  role?: "tab" | "radio" | "button";
}

function tabAriaProps(
  role: NonNullable<TabButtonProps["role"]>,
  active: boolean | undefined,
  tabIndex: number | undefined,
) {
  if (role === "tab") return { "aria-selected": active, tabIndex: tabIndex ?? (active ? 0 : -1) };
  const checked = role === "radio" ? { "aria-checked": active } : { "aria-pressed": active };
  return { ...checked, tabIndex: tabIndex ?? 0 };
}

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
  const checkedProps = tabAriaProps(role, active, tabIndex);
  return (
    <button
      type="button"
      role={role}
      id={id}
      aria-controls={ariaControls}
      {...checkedProps}
      onClick={onClick}
      className={cn(
        "rounded-none font-medium transition-colors duration-150 whitespace-nowrap shrink-0",
        size === "sm" ? "px-3 py-1.5 text-xs" : "px-4 py-2 text-sm",
        active
          ? "bg-bg-card text-text-primary ring-1 ring-inset ring-border"
          : "text-text-secondary hover:text-text-primary",
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

export const RadioToolbar = memo(function RadioToolbar({
  label,
  items,
  value,
  onChange,
}: {
  label: string;
  items: readonly TabItem[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 min-w-0">
      <SegmentedGroup className="overflow-x-auto no-scrollbar" role="radiogroup" aria-label={label}>
        {items.map((item) => (
          <TabButton key={item.id} role="radio" active={value === item.id} onClick={() => onChange(item.id)}>
            {item.label}
          </TabButton>
        ))}
      </SegmentedGroup>
    </div>
  );
});

interface TabContainerProps {
  tabs: TabItem[];
  activeTab: string;
  className?: string;
  tabSize?: "sm" | "md";
  fill?: boolean;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

export const TabContainer = memo(function TabContainer({
  tabs,
  activeTab,
  className,
  tabSize = "md",
  fill,
  onTabChange,
  children,
}: TabContainerProps) {
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
    <div className={cn("flex flex-col gap-3", className)}>
      <SegmentedGroup
        className={cn("w-fit max-w-full overflow-x-auto no-scrollbar sm:flex-wrap", fill && "sm:w-full")}
        role="tablist"
        onKeyDown={handleTablistKeyDown}
      >
        {tabs.map((tab) => (
          <TabButton
            key={tab.id}
            className={fill ? "sm:flex-auto sm:shrink sm:text-center" : undefined}
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
});
