import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "@/client/router";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/providers";
import { DesktopNav, MobileNav, MobileMoreSheet } from "./navigation";

const SettingsSheet = lazy(() => import("./settings-sheet").then((m) => ({ default: m.SettingsSheet })));

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  const closeSettings = useCallback(() => setSettingsOpen(false), []);
  const closeMore = useCallback(() => setMobileMoreOpen(false), []);
  const openSettings = useCallback(() => {
    setMobileMoreOpen(false);
    setSettingsOpen(true);
  }, []);
  const openMore = useCallback(() => {
    setSettingsOpen(false);
    setMobileMoreOpen(true);
  }, []);

  useLayoutEffect(() => {
    const dark = themeMode === "dark";
    document.documentElement.classList.toggle("dark", dark);
    document.documentElement.style.colorScheme = dark ? "dark" : "light";
    const metas = document.querySelectorAll("meta[name='theme-color']");
    for (const meta of metas) meta.setAttribute("content", dark ? "#000000" : "#ffffff");
  }, [themeMode]);

  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  return (
    <div className="min-h-screen h-[100dvh] flex flex-col bg-bg-primary overflow-x-hidden pt-[env(safe-area-inset-top,0px)]">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:bg-bg-primary focus:border focus:border-border focus:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
      >
        {t("skipToContent")}
      </a>
      <DesktopNav onSettingsOpen={openSettings} />
      <main
        ref={mainRef}
        id="main-content"
        tabIndex={-1}
        aria-label={t("mainContent")}
        className="flex-1 min-h-0 overflow-y-auto [scrollbar-gutter:stable] overscroll-contain pb-[calc(4rem+env(safe-area-inset-bottom,0px))] md:pb-4 focus:outline-none"
      >
        {children}
      </main>
      <MobileNav onMoreOpen={openMore} onSettingsOpen={openSettings} />
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsSheet open={settingsOpen} onClose={closeSettings} />
        </Suspense>
      )}
      <MobileMoreSheet open={mobileMoreOpen} onClose={closeMore} />
    </div>
  );
}
