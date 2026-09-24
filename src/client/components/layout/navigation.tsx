import { type ReactNode, useCallback, useEffect, useMemo, useRef } from "react";
import { Settings, MoreHorizontal } from "lucide-react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useTranslation } from "@/client/providers";
import { findRoute, prefetchQueriesForRoute, ROUTES, type NavGroup } from "@/client/config/routes";
import { SafeLink as Link, usePathname } from "@/client/router";
import { REPO_URL } from "@/client/config/nav-config";

export interface NavItem {
  path: string;
  group: NavGroup;
  label: string;
  icon: ReactNode;
  activePrefixes?: readonly string[];
}

export function useNavigation() {
  const { t } = useTranslation();
  return useMemo(() => {
    const all = ROUTES.flatMap((route): NavItem[] => {
      const nav = route.nav;
      if (!nav) return [];
      return [
        {
          path: nav.path,
          group: nav.group,
          label: t(nav.labelKey),
          icon: nav.icon,
          activePrefixes: nav.activePrefixes,
        },
      ];
    });

    return {
      all,
      mobilePrimary: all.filter((item) => item.group === "primary"),
      mobileMore: all.filter((item) => item.group === "secondary"),
    };
  }, [t]);
}

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.path) return true;
  if (item.activePrefixes) return item.activePrefixes.some((p) => pathname.startsWith(p));
  return false;
}

function warmRoute(qc: QueryClient, path: string): void {
  prefetchQueriesForRoute(qc, path);
  void findRoute(path)?.load?.();
}

const HOVER_PREFETCH_DELAY_MS = 150;

export interface PrefetchControls {
  hover: (path: string) => void;
  immediate: (path: string) => void;
  cancel: () => void;
}

export function usePrefetch(): PrefetchControls {
  const qc = useQueryClient();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancel = useCallback(() => {
    if (timer.current === null) return;
    clearTimeout(timer.current);
    timer.current = null;
  }, []);
  useEffect(() => cancel, [cancel]);
  return useMemo(
    () => ({
      hover: (path: string) => {
        cancel();
        timer.current = setTimeout(() => {
          timer.current = null;
          warmRoute(qc, path);
        }, HOVER_PREFETCH_DELAY_MS);
      },
      immediate: (path: string) => {
        cancel();
        warmRoute(qc, path);
      },
      cancel,
    }),
    [qc, cancel],
  );
}

interface DesktopNavProps {
  onSettingsOpen: () => void;
}

const DESKTOP_ICON_BUTTON =
  "p-1.5 text-text-secondary hoverable:hover:text-text-primary transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30";

export function DesktopNav({ onSettingsOpen }: DesktopNavProps) {
  const pathname = usePathname();
  const { all } = useNavigation();
  const { t } = useTranslation();

  const { hover, immediate, cancel } = usePrefetch();

  return (
    <nav
      className="hidden md:flex h-12 shrink-0 items-center border-b border-border bg-bg-primary sticky top-0 z-30"
      aria-label={t("navPrimary")}
    >
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center gap-1">
        <div className="flex items-center gap-0.5">
          {all.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <Link
                key={item.path}
                href={item.path}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                onMouseEnter={() => hover(item.path)}
                onMouseLeave={cancel}
                onFocus={() => immediate(item.path)}
                onBlur={cancel}
                className={`relative px-3 py-1.5 text-sm font-medium transition-colors duration-fast whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/30 focus-visible:ring-offset-1 ${
                  active ? "text-text-primary" : "text-text-secondary hoverable:hover:text-text-primary"
                }`}
              >
                {item.label}
                <span
                  aria-hidden="true"
                  className={`absolute inset-x-3 -bottom-px h-px bg-accent transition-transform duration-base origin-left ${
                    active ? "scale-x-100" : "scale-x-0"
                  }`}
                />
              </Link>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className={DESKTOP_ICON_BUTTON}
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <button type="button" aria-label={t("settings")} onClick={onSettingsOpen} className={DESKTOP_ICON_BUTTON}>
            <Settings size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}

interface MobileNavProps {
  onMoreOpen: () => void;
  onSettingsOpen: () => void;
}

const MOBILE_BAR_BUTTON =
  "flex-1 flex flex-col items-center justify-center gap-1 text-center text-xs font-medium transition-colors duration-fast focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring/30 min-h-16 py-2";

const mobileBarItemClass = (active: boolean) =>
  `${MOBILE_BAR_BUTTON} relative ${active ? "text-accent" : "text-text-secondary"}`;

const ActiveIndicator = () => <span className="absolute top-0 left-1/4 right-1/4 h-0.5 bg-accent" aria-hidden="true" />;

function MobileBarButton({
  active,
  onClick,
  label,
  children,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  children: ReactNode;
}) {
  return (
    <button type="button" onClick={onClick} aria-label={label} className={mobileBarItemClass(active)}>
      {children}
    </button>
  );
}

export function MobileNav({ onMoreOpen, onSettingsOpen }: MobileNavProps) {
  const pathname = usePathname();
  const { t } = useTranslation();
  const { mobilePrimary, mobileMore } = useNavigation();
  const { immediate } = usePrefetch();

  const isMoreActive = mobileMore.some((n) => isNavActive(pathname, n));

  return (
    <nav
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex h-16 items-stretch border-t border-border bg-bg-primary pb-[env(safe-area-inset-bottom,0px)]"
      aria-label={t("navPrimaryMobile")}
    >
      {mobilePrimary.map((item) => {
        const active = isNavActive(pathname, item);
        return (
          <Link
            key={item.path}
            href={item.path}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            onTouchStart={() => immediate(item.path)}
            className={mobileBarItemClass(active)}
          >
            {active && <ActiveIndicator />}
            {item.icon}
            <span>{item.label}</span>
          </Link>
        );
      })}
      <MobileBarButton active={isMoreActive} onClick={onMoreOpen} label={t("more")}>
        {isMoreActive && <ActiveIndicator />}
        <MoreHorizontal size={18} />
        <span>{t("more")}</span>
      </MobileBarButton>
      <MobileBarButton active={false} onClick={onSettingsOpen} label={t("settings")}>
        <Settings size={18} />
        <span>{t("settings")}</span>
      </MobileBarButton>
    </nav>
  );
}
