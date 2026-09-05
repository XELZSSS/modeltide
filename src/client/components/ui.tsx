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

// ---- badge ----
/** Small outlined label chip. */
export const Badge = memo(function Badge({ className, children }: { className?: string; children?: ReactNode }) {
  return (
    <span
      className={cn(
        "inline-flex items-center text-xs font-medium uppercase tracking-wide leading-5 px-2 py-0.5 rounded-none transition-colors border border-border text-text-secondary bg-transparent",
        className,
      )}
    >
      {children}
    </span>
  );
});

// ---- button ----
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
  sm: "h-8 px-3 text-xs rounded-none",
  md: "h-9 px-4 text-sm rounded-none",
  icon: "size-9 rounded-none",
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

// ---- card ----
/** Card container. Sharp square corners, flat border — crisp data-dashboard look. */
export const Card = memo(function Card({ children, className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("border border-border bg-bg-card", className)} {...props}>
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
      className={cn("w-full min-w-0", padding === "sm" && "p-4", padding === "md" && "p-4 sm:p-5", className)}
      {...props}
    >
      {children}
    </div>
  );
});

// ---- dot ----
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
      className={cn("inline-block rounded-none shrink-0", dotSizeClass[size], className)}
      style={color ? { backgroundColor: color } : undefined}
    />
  );
});

// ---- grids ----
/** Pill-group container used to visually group segmented controls (e.g. tabs). */
export function SegmentedGroup({ className, children, ...rest }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={cn("flex gap-1 p-0.5 rounded-none border border-border bg-bg-secondary", className)} {...rest}>
      {children}
    </div>
  );
}

const CARD_GRID_COLS = { 2: "", 3: "lg:grid-cols-3", 4: "lg:grid-cols-4" } as const;
const GRID_GAPS = { 2: "gap-2", 3: "gap-3", 4: "gap-4" } as const;

/** Responsive card grid: 1 col mobile, 2 from `sm`, up to `cols` on `lg`. */
export function CardGrid({
  cols = 3,
  gap = 3,
  className,
  children,
}: {
  cols?: 2 | 3 | 4;
  gap?: 2 | 3 | 4;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div className={cn("grid grid-cols-1 sm:grid-cols-2", CARD_GRID_COLS[cols], GRID_GAPS[gap], className)}>
      {children}
    </div>
  );
}

/** Vertical stack with consistent spacing for detail pages. */
export function DetailLayout({ children }: { children: ReactNode }) {
  return <div className="flex flex-col gap-4">{children}</div>;
}

/** Flat titled section for detail pages (no nested Card). */
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
    <section className={cn("flex flex-col gap-4", className)}>
      <h2 className="ui-card-title">{title}</h2>
      {children}
    </section>
  );
}

const STAT_GRID_COLS = { 2: "grid-cols-2", 3: "grid-cols-3", 4: "grid-cols-2 md:grid-cols-4" } as const;

/** Statistic grid (`columns={4}` renders 2 cols on mobile, 4 from `md`). */
export function StatGrid({ columns = 4, children }: { columns?: 2 | 3 | 4; children: ReactNode }) {
  return <div className={cn("grid gap-3 sm:gap-4", STAT_GRID_COLS[columns])}>{children}</div>;
}

/** Two-column grid on desktop for label/value card pairs. */
export function InfoGrid({ children }: { children: ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">{children}</div>;
}

// ---- info-card ----
/** Title above a vertical stack of label/value rows. */
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

/** Label/value row for InfoCard. Single text-sm scale. */
export const InfoRow = memo(function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={cn("flex flex-row justify-between min-w-0 py-1.5 gap-3")}>
      <p className="text-sm text-text-secondary truncate">{label}</p>
      {/* div (not p): values can be links/code blocks. */}
      <div className="text-sm font-mono tabular-nums text-right truncate text-text-primary font-medium min-w-0">
        {value}
      </div>
    </div>
  );
});

// ---- input ----
// Hide native number-input spinners (webkit + Firefox).
const noSpinners =
  "[appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none";

export const Input = forwardRef<HTMLInputElement, Omit<React.InputHTMLAttributes<HTMLInputElement>, "size">>(
  function Input({ className, type, "aria-invalid": ariaInvalid, ...props }, ref) {
    return (
      <input
        ref={ref}
        type={type}
        aria-invalid={ariaInvalid}
        className={cn(
          "h-9 px-3 min-w-0 max-w-full text-base sm:text-sm rounded-none border border-border bg-bg-primary text-text-primary placeholder:text-text-tertiary outline-none transition-colors focus:border-text-tertiary",
          type === "number" && noSpinners,
          className,
        )}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

// ---- pagination ----
interface PaginationProps {
  page: number;
  totalPages: number;
  onChange: (page: number) => void;
  className?: string;
}

function PageButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <Button variant="outline" size="icon" aria-label={label} disabled={disabled} onClick={onClick}>
      {children}
    </Button>
  );
}

/** Prev/next pagination; renders nothing for a single page. */
export const Pagination = memo(function Pagination({ page, totalPages, onChange, className }: PaginationProps) {
  const { t } = useTranslation();
  if (totalPages <= 1) return null;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <PageButton label={t("previousPage")} disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={16} />
      </PageButton>
      <span className="text-sm text-text-secondary tabular-nums" aria-live="polite">
        {page} / {totalPages}
      </span>
      <PageButton label={t("nextPage")} disabled={page >= totalPages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={16} />
      </PageButton>
    </div>
  );
});

// ---- sheet ----
// Focus-trap selector.
const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Ref-counted body scroll lock for stacked sheets.
let sheetLockCount = 0;

interface SheetProps {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
  ariaLabel?: string;
  ariaLabelledBy?: string;
}

/**
 * Bottom-sheet dialog (centered on desktop) in a portal. Traps focus, closes
 * on Escape, locks body scroll, restores focus on close.
 */
export function Sheet({ open, onClose, children, className, ariaLabel, ariaLabelledBy }: SheetProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<Element | null>(null);

  // Focus trap (Tab cycles first/last), Escape closes, restore focus on close.
  // Scroll locks are ref-counted so stacked sheets don't unlock early.
  useEffect(() => {
    if (!open) return;
    triggerRef.current = document.activeElement;
    sheetLockCount++;
    const prevOverflow = document.body.style.overflow;
    const prevPaddingRight = document.body.style.paddingRight;
    // Lock scroll and compensate for scrollbar to avoid layout shift.
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
    // Move focus into the dialog promptly for screen readers; fall back to
    // the panel itself when there are no focusable controls.
    const timer = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const first = panel.querySelector<HTMLElement>(FOCUSABLE_SELECTOR);
      if (first) first.focus();
      else {
        panel.setAttribute("tabindex", "-1");
        panel.focus();
      }
    }, 50);
    return () => {
      document.removeEventListener("keydown", handler);
      clearTimeout(timer);
      sheetLockCount = Math.max(0, sheetLockCount - 1);
      if (sheetLockCount === 0) {
        document.body.style.overflow = prevOverflow;
        document.body.style.paddingRight = prevPaddingRight;
      }
      if (triggerRef.current instanceof HTMLElement) triggerRef.current.focus();
    };
  }, [open, onClose]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" onClick={onClose}>
      <div className="fixed inset-0 bg-black/50 animate-fade-in" aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-labelledby={ariaLabelledBy}
        className={cn(
          "relative z-50 w-full max-w-md rounded-none border border-border bg-bg-primary shadow-none animate-sheet-up focus:outline-none",
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

// ---- stat-card ----
interface StatCardProps {
  label: string;
  value: ReactNode;
  icon?: ComponentType<{ className?: string }>;
  className?: string;
}

/** Compact metric card for stat grids. Label caption, value title scale. */
export const StatCard = memo(function StatCard({ label, value, icon: Icon, className }: StatCardProps) {
  return (
    <Card className={className}>
      <CardContent padding="sm" className="text-center">
        <div className="flex items-center justify-center gap-1.5 mb-2 min-w-0">
          {Icon && (
            <span className="text-text-tertiary shrink-0">
              <Icon className="size-4" />
            </span>
          )}
          <p className="text-xs text-text-tertiary font-medium truncate">{label}</p>
        </div>
        <p className="text-xl font-semibold tracking-tight break-words min-w-0">{value}</p>
      </CardContent>
    </Card>
  );
});

// ---- tabs ----
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
   * ARIA role override. View-mode switches must pass role="radio" inside a
   * radiogroup — a bare role="tab" outside a tablist is invalid.
   */
  role?: "tab" | "radio" | "button";
}

/** ARIA selection props per role (tab keeps roving tabindex; radio/button stay focusable). */
function tabAriaProps(
  role: NonNullable<TabButtonProps["role"]>,
  active: boolean | undefined,
  tabIndex: number | undefined,
) {
  if (role === "tab") return { "aria-selected": active, tabIndex: tabIndex ?? (active ? 0 : -1) };
  const checked = role === "radio" ? { "aria-checked": active } : { "aria-pressed": active };
  return { ...checked, tabIndex: tabIndex ?? 0 };
}

/** Tab button with roving tabindex (only the active tab is focusable). */
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

interface TabContainerProps {
  tabs: TabItem[];
  activeTab: string;
  className?: string;
  tabSize?: "sm" | "md";
  /** Stretch tabs to fill each row on sm+. */
  fill?: boolean;
  onTabChange: (tabId: string) => void;
  children: ReactNode;
}

/** Tab list with arrow-key navigation; `children` is the active panel. */
export function TabContainer({
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
}
