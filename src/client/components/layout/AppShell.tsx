import {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useLocation } from "react-router";
import { useSettingsStore, useThemeStorageSync } from "@/client/stores";
import { useTranslation } from "@/client/providers";
import { cn } from "@/client/utils/cn";
import { TabContainer, type TabItem } from "@/client/components/ui/tabs";
import { DesktopNav, MobileNav, MobileMoreSheet } from "./navigation";
import { PwaBanners } from "@/client/pwa/banners";

const SettingsSheet = lazy(() => import("./SettingsSheet").then((m) => ({ default: m.SettingsSheet })));

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

  useLayoutEffect(() => {
    const dark = themeMode === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const meta = document.querySelector("meta[name='theme-color']");
    if (meta) meta.setAttribute("content", dark ? "#000000" : "#ffffff");
  }, [themeMode]);

  useLayoutEffect(() => {
    document.body.dataset.accent = accentForPath(location.pathname);
  }, [location.pathname]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [location.pathname]);

  return (
    <div className="min-h-screen h-[100dvh] flex flex-col bg-bg-primary overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-bg-primary focus:border focus:border-border focus:rounded-none focus:text-sm focus:outline-none focus:ring-2 focus:ring-accent"
      >
        {t("skipToContent")}
      </a>
      <DesktopNav onSettingsOpen={() => setSettingsOpen(true)} />
      <PwaBanners />
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        aria-label={t("mainContent")}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-4 focus:outline-none"
      >
        {children}
      </main>
      <MobileNav onMoreOpen={() => setMobileMoreOpen(true)} onSettingsOpen={() => setSettingsOpen(true)} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet open={settingsOpen} onClose={closeSettings} />
        </Suspense>
      )}
      <MobileMoreSheet open={mobileMoreOpen} onClose={closeMore} />
    </div>
  );
}

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
  compact?: boolean;
  containerClassName?: string;
  countLabel?: string;
  tabs: TabItem[];
  activeTab: string;
  onTabChange: (id: string) => void;
  tabSize?: "sm" | "md";
  tabClassName?: string;
  tabFill?: boolean;
  children: ReactNode;
}

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
