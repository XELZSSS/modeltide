import {
  memo,
  type ReactNode,
  type Ref,
  forwardRef,
  useEffect,
  useRef,
  type ComponentType,
  type KeyboardEvent,
} from "react";
import { cn } from "@/client/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { createPortal } from "react-dom";

// ---- client/components/ui/badge.tsx ----
/** Small outlined label chip. */
export const Badge = memo(function Badge({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium leading-[18px] px-2 py-0.5 rounded-full transition-colors border border-border text-text-secondary bg-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
});

// ---- client/components/ui/button.tsx ----
type ButtonVariant = "primary" | "outline" | "ghost" | "link" | "destructive";
type ButtonSize = "sm" | "icon" | "md";

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Ref to the underlying button element (React 19 ref-as-prop, no forwardRef needed). */
  ref?: Ref<HTMLButtonElement>;
}

const baseClass =
  "inline-flex items-center justify-center whitespace-nowrap font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-2 focus-visible:ring-offset-bg-primary";

const variantClass: Record<ButtonVariant, string> = {
  primary: "bg-accent text-accent-contrast hover:bg-accent/90",
  outline: "border border-border text-text-primary hover:bg-hover",
  ghost: "text-text-primary hover:bg-hover",
  link: "text-text-primary underline-offset-4 hover:underline",
  destructive: "bg-destructive text-white hover:bg-destructive/90",
};

const sizeClass: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-xs rounded-md",
  md: "h-9 px-4 text-sm rounded-md",
  icon: "size-9 rounded-md",
};

/** Shared button with variant/size presets; defaults to type="button" (pass type="submit" in forms). */
export function Button({
  variant = "ghost",
  size = "sm",
  type = "button",
  className,
  children,
  disabled,
  ref,
  ...props
}: ButtonProps) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled}
      className={cn(baseClass, variantClass[variant], sizeClass[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

// ---- client/components/ui/card.tsx ----
/**
 * Card container. Content surfaces use square corners; rounded corners are
 * reserved for interactive controls and floating overlays (buttons, tabs,
 * inputs, badges, sheets).
 */
export const Card = memo(function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border border-border bg-bg-card shadow-xs", className)} {...props}>
      {children}
    </div>
  );
});

interface CardContentProps extends React.HTMLAttributes<HTMLDivElement> {
  padding?: "sm" | "md";
}

export const CardContent = memo(function CardContent({
  className,
  children,
  padding = "md",
  ...props
}: CardContentProps) {
  return (
    <div
      className={cn("w-full min-w-0", padding === "sm" && "p-3.5 sm:p-4", padding === "md" && "p-4 sm:p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
});

// ---- client/components/ui/dot.tsx ----
const dotSizeClass = {
  sm: "w-2 h-2",
  md: "w-2.5 h-2.5",
} as const;

export const Dot = memo(function Dot({
  size = "md",
  color,
  className,
}: {
  size?: keyof typeof dotSizeClass;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn("inline-block rounded-full shrink-0", dotSizeClass[size], className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
});

// ---- client/components/ui/grids.tsx ----
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

// ---- client/components/ui/info-card.tsx ----
/** Card that groups a title above a vertical stack of label/value rows. */
export const InfoCard = memo(function InfoCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <Card>
      <CardContent padding="md">
        <p className="text-sm font-semibold mb-3 text-text-primary">{title}</p>
        <div className="flex flex-col gap-2 min-w-0">{children}</div>
      </CardContent>
    </Card>
  );
});

/** Single label/value row for use inside an InfoCard; `compact` shrinks the text size. */
export const InfoRow = memo(function InfoRow({
  label,
  value,
  compact = false,
}: {
  label: string;
  value: ReactNode;
  compact?: boolean;
}) {
  const textSize = compact ? "text-xs sm:text-sm" : "text-sm";
  return (
    <div className={cn("flex flex-row justify-between min-w-0 py-1.5", compact ? "gap-2" : "gap-4")}>
      <p className={cn(textSize, "text-text-secondary truncate")}>{label}</p>
      {/* div (not p): values can be links/code blocks, which must not nest inside <p>. */}
      <div className={cn(textSize, "font-mono tabular-nums text-right truncate text-text-primary font-medium min-w-0")}>
        {value}
      </div>
    </div>
  );
});

// ---- client/components/ui/input.tsx ----
// Hide the native number-input spinners (webkit + Firefox) for a cleaner field.
const noSpinners =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

/** Text/number input; number fields have native spinners hidden via `noSpinners`. */
export const Input = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">>(
  function Input({ className, type, "aria-invalid": ariaInvalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-9 px-3 text-sm rounded-md border border-border bg-bg-primary text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-text-tertiary",
          type === "number" && noSpinners,
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

// ---- client/components/ui/pagination.tsx ----
interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

/** Prev/next pagination control; renders nothing when there's only one page. */
export const Pagination = memo(function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <Button
        variant="outline"
        size="icon"
        aria-label={t("previousPage")}
        disabled={page <= 1}
        onClick={() => onChange(page - 1)}
      >
        <ChevronLeft size={16} />
      </Button>
      <span className="text-sm text-text-secondary tabular-nums" aria-live="polite">
        {page} / {totalPages}
      </span>
      <Button
        variant="outline"
        size="icon"
        aria-label={t("nextPage")}
        disabled={page >= totalPages}
        onClick={() => onChange(page + 1)}
      >
        <ChevronRight size={16} />
      </Button>
    </div>
  );
});

// ---- client/components/ui/sheet.tsx ----
// Selector for elements that should be reachable inside the sheet for the focus trap.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/**
 * Bottom-sheet dialog (centered on desktop) rendered in a portal. While open it traps
 * focus, closes on Escape, locks body scroll, and restores focus to the trigger element on close.
 */
export function Sheet({ open, onClose, children, className, ariaLabel, ariaLabelledBy }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Remember the trigger so focus can be restored on close; while open, trap focus
  // within the panel (Tab cycles first/last) and Escape closes the sheet.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Lock scroll and compensate for scrollbar to avoid layout shift
    const scrollbarW = window.innerWidth - document.documentElement.clientWidth;
    document.body.style.overflow = "hidden";
    if (scrollbarW > 0) document.body.style.paddingRight = `${scrollbarW}px`;

    const handler = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR);
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (!first || !last) return;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", handler);
    // Focus the panel's first control on the next frame, but only when focus
    // isn't already somewhere meaningful (don't steal it from the trigger flow).
    const timer = setTimeout(() => {
      if (document.activeElement && document.activeElement !== document.body) return;
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE_SELECTOR)?.focus();
    }, 50); // Small delay to ensure DOM is ready
    return () => {
      document.removeEventListener("keydown", handler);
      clearTimeout(timer);
      document.body.style.overflow = prevOverflow;
      document.body.style.paddingRight = prevPaddingRight;
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/40 backdrop-blur-[2px] animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "relative z-50 w-full max-w-md rounded-t-xl sm:rounded-xl border border-border bg-bg-primary shadow-lg animate-sheet-up focus:outline-none",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </div>,
    document.body,
  );
}

// ---- client/components/ui/stat-card.tsx ----
interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

/** Compact metric card used in stat grids. */
export const StatCard = memo(function StatCard({ label, value, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent padding="sm" className="text-center">
        <div className="flex items-center justify-center gap-1.5 mb-1.5 min-w-0">
          {Icon && (
            <span className="text-text-tertiary shrink-0">
              <Icon className="size-3.5" />
            </span>
          )}
          <p className="text-[11px] sm:text-xs text-text-tertiary font-medium truncate">{label}</p>
        </div>
        <p className="text-lg sm:text-xl font-semibold tracking-tight break-words min-w-0">{value}</p>
      </CardContent>
    </Card>
  );
});

// ---- client/components/ui/tabs.tsx ----
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
