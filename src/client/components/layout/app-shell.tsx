import { Suspense, lazy, useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { isPopstateNavigation, historyIndex, usePathname, useSearchParams } from "@/client/router";
import { useSettingsStore } from "@/client/stores";
import { useTranslation } from "@/client/providers";
import { DesktopNav, MobileNav, MobileMoreSheet } from "./navigation";
import { ErrorBoundary } from "@/client/router/suspense-query";

const SettingsSheet = lazy(() => import("./settings-sheet").then((m) => ({ default: m.SettingsSheet })));

function SettingsErrorBoundary({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  return (
    <ErrorBoundary
      errorTitle={t("errorBoundaryTitle")}
      retryLabel={t("errorBoundaryRetry")}
      offlineMessage={t("offlineRetry")}
    >
      <Suspense fallback={null}>
        <SettingsSheet open={open} onClose={onClose} />
      </Suspense>
    </ErrorBoundary>
  );
}

/** Scroll offset per history entry; module scope because `<main>` is remounted on every route change. */
const scrollOffsets = new Map<number, number>();

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileMoreOpen, setMobileMoreOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const themeMode = useSettingsStore((s) => s.themeMode);
  const { t } = useTranslation();
  const mainRef = useRef<HTMLElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

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
    for (const meta of metas) meta.setAttribute("content", dark ? "#1a1a1a" : "#fafbfc");
  }, [themeMode]);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    // Kept per entry rather than read on leave: the element is gone once the next route renders.
    const record = () => scrollOffsets.set(historyIndex(), main.scrollTop);
    main.addEventListener("scroll", record, { passive: true });
    return () => main.removeEventListener("scroll", record);
  }, []);

  useEffect(() => {
    const main = mainRef.current;
    if (!main) return;
    const idx = historyIndex();
    if (isPopstateNavigation()) {
      main.scrollTo({ top: scrollOffsets.get(idx) ?? 0 });
      return;
    }
    // This entry is new from here on, and the entries ahead are gone with the push: drop their offsets.
    for (const key of scrollOffsets.keys()) if (key >= idx) scrollOffsets.delete(key);
    main.scrollTo({ top: 0 });
  }, [pathname, searchParams]);

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
      {settingsOpen && <SettingsErrorBoundary open onClose={closeSettings} />}
      <MobileMoreSheet open={mobileMoreOpen} onClose={closeMore} />
    </div>
  );
}
