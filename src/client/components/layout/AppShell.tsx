import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useSettingsStore, useThemeStorageSync } from "@/client/stores";
import { useTranslation } from "@/client/providers";
import { cn } from "@/client/utils";
import { TabContainer, type TabItem } from "@/client/components/ui";
import { DesktopNav } from "./navigation";
import { MobileNav } from "./navigation";
import { MobileMoreSheet } from "./navigation";
import { SettingsSheet } from "./SettingsSheet";

// Accent theme per section: nav, selection and focus match the content area.
const ACCENT_BY_PREFIX: readonly (readonly [string, string])[] = [
  ["/news", "news"],
  ["/status", "status"],
  ["/releases", "releases"],
  ["/models", "rankings"],
  ["/compare", "rankings"],
  ["/price-compare", "rankings"],
  ["/model", "rankings"],
];

function accentForPath(pathname: string): string {
  const hit = ACCENT_BY_PREFIX.find(([prefix]) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return hit?.[1] ?? "home";
}

/** App chrome: desktop/mobile nav, main scroll area, settings and "more" sheets. */
export function AppShell({ children }: { children: ReactNode }) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const themeMode = useSettingsStore((s) => s.themeMode);
  useThemeStorageSync();
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  const location = useLocation();

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeMore = useCallback(() => setMobileMoreOpen(false), []);

  // Toggle the theme before paint to avoid a flash on load/switch.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  // Scope the accent to <body> so portal sheets inherit it too.
  useLayoutEffect(() => {
    document.body.dataset.accent = accentForPath(location.pathname);
  }, [location.pathname]);

  // Scroll the main pane to top on route change.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen h-[100dvh] flex flex-col bg-bg-primary overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-bg-primary focus:border focus:border-border focus:rounded-md focus:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {t("skipToContent")}
      </a>
      <DesktopNav onSettingsOpen={() => setSettingsOpen(true)} />
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        aria-label={t("mainContent")}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pb-[calc(5rem+env(safe-area-inset-bottom,0px))] md:pb-4 focus:outline-none"
      >
        {children}
      </main>
      <MobileNav onMoreOpen={() => setMobileMoreOpen(true)} onSettingsOpen={() => setSettingsOpen(true)} />
      <SettingsSheet open={settingsOpen} onClose={closeSettings} />
      <MobileMoreSheet open={mobileMoreOpen} onClose={closeMore} />
    </div>
  );
}

// ---- page scaffolding (merged from page.tsx) ----
/** Centred page wrapper with a max-width and responsive horizontal padding. */
export function PageContainer({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-5", className)}>{children}</div>;
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
        "flex flex-col sm:flex-row sm:items-center justify-between gap-3",
        compact ? "mb-4" : "mb-4 sm:mb-5",
      )}
    >
      <div className="min-w-0">
        <h1 className={cn(compact ? "text-lg sm:text-xl" : "ui-page-title")}>{title}</h1>
        {description && <p className="ui-body-secondary mt-1.5">{description}</p>}
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
    <section className={cn("my-4 sm:my-6", className)} aria-labelledby={title ? headingId : undefined}>
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
  /** Fill tab rows edge-to-edge on sm+; passed through to TabContainer. */
  tabFill?: boolean;
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
  tabFill,
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
        fill={tabFill}
        onTabChange={onTabChange}
      >
        {children}
      </TabContainer>
    </PageContainer>
  );
}
