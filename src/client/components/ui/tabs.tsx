import { memo, type ReactNode, type KeyboardEvent } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/client/utils/cn";
import { SegmentedGroup } from "@/client/components/ui/grids";

const tabButtonVariants = cva(
  "font-medium transition-colors duration-fast whitespace-nowrap shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 disabled:opacity-50 disabled:pointer-events-none relative pb-2.5",
  {
    variants: {
      active: {
        true: "text-text-primary after:absolute after:inset-x-0 after:-bottom-px after:h-px after:bg-accent",
        false: "text-text-secondary hoverable:hover:text-text-primary",
      },
      size: {
        sm: "px-1 py-1.5 text-xs tracking-label",
        md: "px-1 py-2 text-sm tracking-label",
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

/** Roving-focus move for Arrow/Home/End; null means "not a navigation key" — leave the event alone. */
export function nextIndexForKey(key: string, index: number, length: number): number | null {
  if (length === 0 || index < 0) return null;
  if (key === "ArrowRight" || key === "ArrowDown") return (index + 1) % length;
  if (key === "ArrowLeft" || key === "ArrowUp") return (index - 1 + length) % length;
  if (key === "Home") return 0;
  if (key === "End") return length - 1;
  return null;
}

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
  ariaLabel,
  onTabChange,
  children,
}: TabContainerProps) {
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const nextIndex = nextIndexForKey(
      event.key,
      tabs.findIndex((tab) => tab.id === activeTab),
      tabs.length,
    );
    if (nextIndex == null) return;
    event.preventDefault();
    onTabChange(tabs[nextIndex]!.id);
    document.getElementById(`tab-${tabs[nextIndex]!.id}`)?.focus();
  };

  return (
    <div className={cn("flex flex-col gap-4", className)}>
      <SegmentedGroup
        className={cn("w-fit max-w-full overflow-x-auto no-scrollbar sm:flex-wrap", fill && "w-full sm:w-full")}
        role="tablist"
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
            tabIndex={activeTab === tab.id ? 0 : -1}
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
