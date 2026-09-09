"use client";
import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "@/client/router";
import { useSettingsStore, useThemeStorageSync } from "@/client/stores";
import { useTranslation } from "@/client/providers";
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
  const pathname = usePathname();

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
    document.body.dataset.accent = accentForPath(pathname);
  }, [pathname]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

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

// Re-export page layout primitives from dedicated module
export { PageContainer, PageHeader, PageSection, TabbedPage } from "./page";
