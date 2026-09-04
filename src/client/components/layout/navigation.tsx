import { type ReactNode, useMemo } from "react";
import { Home, Award, Megaphone, Newspaper, Activity, Settings, MoreHorizontal } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { NavLink, useLocation } from "react-router";
import { Sheet } from "@/client/components/ui";
import { REPO_URL } from "@/shared/config";

// ---- navigation ----
export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: string[];
}

/**
 * Primary + secondary nav items (localised). Secondary items live in the
 * mobile "More" sheet; `matchPrefix` keeps items active on nested routes.
 */
export function useNavigation() {
  const { t } = useTranslation();
  return useMemo(() => {
    const primary: NavItem[] = [
      { path: "/", label: t("home"), icon: <Home size={18} /> },
      {
        path: "/models",
        label: t("rankings"),
        icon: <Award size={18} />,
        matchPrefix: ["/model/", "/compare", "/price-compare"],
      },
    ];
    const secondary: NavItem[] = [
      { path: "/releases", label: t("releases"), icon: <Megaphone size={18} /> },
      { path: "/news", label: t("aiNews"), icon: <Newspaper size={18} /> },
      { path: "/status", label: t("navStatus"), icon: <Activity size={18} />, matchPrefix: ["/status"] },
    ];
    const all = [...primary, ...secondary];
    const mobilePrimary = primary;
    const mobilePrimaryPaths = new Set(mobilePrimary.map((n) => n.path));
    const mobileMore = all.filter((n) => !mobilePrimaryPaths.has(n.path));

    return { all, mobilePrimary, mobileMore };
  }, [t]);
}

/** Active on exact path or any matchPrefix. */
export function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.path) return true;
  if (item.matchPrefix) return item.matchPrefix.some((p) => pathname.startsWith(p));
  return false;
}

// ---- DesktopNav ----
interface DesktopNavProps {
  onSettingsOpen: () => void;
}

/** Top bar on desktop (hidden below `md`). */
export function DesktopNav({ onSettingsOpen }: DesktopNavProps) {
  const { pathname } = useLocation();
  const { all } = useNavigation();
  const { t } = useTranslation();

  return (
    <nav
      className="hidden md:flex h-11 shrink-0 items-center border-b border-border bg-nav-bg backdrop-blur-lg"
      aria-label={t("navPrimary")}
    >
      <div className="max-w-7xl mx-auto w-full px-4 sm:px-6 lg:px-8 flex items-center">
        <div className="flex items-center gap-1">
          {all.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`relative px-3 py-1 text-sm font-medium rounded-full transition-colors whitespace-nowrap active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 ${
                  active ? "text-accent bg-accent-light" : "text-text-secondary hover:text-text-primary hover:bg-hover"
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
        <div className="ml-auto flex items-center gap-1">
          <a
            href={REPO_URL}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="GitHub"
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-full hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0 0 24 12c0-6.63-5.37-12-12-12z" />
            </svg>
          </a>
          <button
            type="button"
            aria-label={t("settings")}
            onClick={onSettingsOpen}
            className="p-1.5 text-text-secondary hover:text-text-primary rounded-full hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}

// ---- MobileNav ----
interface MobileNavProps {
  onMoreOpen: () => void;
  onSettingsOpen: () => void;
}

/** Fixed bottom bar on mobile; primary items plus "More". */
export function MobileNav({ onMoreOpen, onSettingsOpen }: MobileNavProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { mobilePrimary, mobileMore } = useNavigation();

  // Highlight "More" when on a secondary (collapsed) route.
  const isMoreActive = mobileMore.some((n) => isNavActive(pathname, n));

  return (
    <nav
      className="md:hidden fixed left-1/2 -translate-x-1/2 bottom-[calc(env(safe-area-inset-bottom,0px)+0.75rem)] z-30 flex h-14 items-center rounded-full border border-border bg-nav-bg backdrop-blur-lg shadow-lg"
      aria-label={t("navPrimaryMobile")}
    >
      {mobilePrimary.map((item) => {
        const active = isNavActive(pathname, item);
        return (
          <NavLink
            key={item.path}
            to={item.path}
            aria-label={item.label}
            aria-current={active ? "page" : undefined}
            className={`w-20 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full ${active ? "text-accent" : "text-text-secondary"}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <button
        type="button"
        onClick={onMoreOpen}
        aria-label={t("more")}
        className={`w-20 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full ${isMoreActive ? "text-accent" : "text-text-secondary"}`}
      >
        <MoreHorizontal size={18} />
        <span>{t("more")}</span>
      </button>
      <button
        type="button"
        onClick={onSettingsOpen}
        aria-label={t("settings")}
        className="w-20 flex flex-col items-center justify-center gap-1 text-xs font-medium transition-colors text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full"
      >
        <Settings size={18} />
        <span>{t("settings")}</span>
      </button>
    </nav>
  );
}

// ---- MobileMoreSheet ----
interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const tileClass = (active: boolean) =>
  `flex flex-col items-center gap-1.5 w-20 py-3 rounded-lg text-xs font-medium transition-colors ${
    active ? "bg-selected text-accent" : "text-text-secondary hover:bg-hover"
  }`;

/** Compact floating "More" menu on mobile, above the bottom nav. */
export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { pathname } = useLocation();
  const { mobileMore } = useNavigation();
  const { t } = useTranslation();

  return (
    <Sheet open={open} onClose={onClose} className="w-auto mb-24 rounded-lg p-2" ariaLabel={t("navMore")}>
      <nav className="flex gap-1" aria-label={t("navSecondary")}>
        {mobileMore.map((item) => {
          const active = isNavActive(pathname, item);
          return <NavTile key={item.path} item={item} active={active} onClose={onClose} />;
        })}
      </nav>
    </Sheet>
  );
}

function NavTile({ item, active, onClose }: { item: NavItem; active: boolean; onClose: () => void }) {
  return (
    <NavLink to={item.path} onClick={onClose} aria-current={active ? "page" : undefined} className={tileClass(active)}>
      <span className="[&>svg]:size-[22px]">{item.icon}</span>
      <span>{item.label}</span>
    </NavLink>
  );
}
