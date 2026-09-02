import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { useLocation } from "react-router";
import { useSettingsStore, useThemeStorageSync } from "@/client/stores";
import { useTranslation } from "@/client/providers";
import { DesktopNav } from "./DesktopNav";
import { MobileNav } from "./MobileNav";
import { MobileMoreSheet } from "./MobileMoreSheet";
import { SettingsSheet } from "./SettingsSheet";

// Per-section accent themes (see globals.css): each content area carries its own
// accent hue so the active nav item, selection and focus states match the section.
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
  return ACCENT_BY_PREFIX.find(([prefix]) => pathname.startsWith(prefix))?.[1] ?? "home";
}

/** Application chrome: desktop/mobile nav, main scroll area, settings and "more" sheets. */
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

  // Toggle the theme before paint to avoid flashing the wrong theme on load/switch.
  useLayoutEffect(() => {
    document.documentElement.classList.toggle("dark", themeMode === "dark");
  }, [themeMode]);

  // Scope the accent theme to <body> so portal-rendered sheets inherit it too.
  useLayoutEffect(() => {
    document.body.dataset.accent = accentForPath(location.pathname);
  }, [location.pathname]);

  // Scroll the main pane to the top whenever the route changes (non-blocking).
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
      {/* Bottom padding keeps content clear of the floating mobile nav (plus iOS safe-area). */}
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
