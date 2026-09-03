import { type ReactNode, useMemo } from "react";
import { Home, Award, Megaphone, Newspaper, Activity, Settings, MoreHorizontal } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { NavLink, useLocation } from "react-router";
import { Sheet } from "@/client/components/ui";

// ---- client/components/layout/navigation.tsx ----
export interface NavItem {
  path: string;
  label: string;
  icon: ReactNode;
  matchPrefix?: string[];
}

/**
 * Builds the primary and secondary nav items (localised). Secondary items are shown in
 * the mobile "More" sheet; `matchPrefix` keeps a nav item active on nested routes.
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

/** Active if the path equals the item path or matches any configured prefix (nested routes). */
export function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.path) return true;
  if (item.matchPrefix) return item.matchPrefix.some((p) => pathname.startsWith(p));
  return false;
}

// ---- client/components/layout/DesktopNav.tsx ----
interface DesktopNavProps {
  onSettingsOpen: () => void;
}

/** Top navigation bar shown on desktop (hidden below the `md` breakpoint). */
export function DesktopNav({ onSettingsOpen }: DesktopNavProps) {
  const { pathname } = useLocation();
  const { all } = useNavigation();
  const { t } = useTranslation();

  return (
    <nav
      className="hidden md:flex h-14 shrink-0 items-center border-b border-border bg-nav-bg backdrop-blur-lg"
      aria-label={t("navPrimary")}
    >
      <div className="max-w-7xl mx-auto w-full px-3 sm:px-6 lg:px-8 flex items-center">
        <div className="flex items-center gap-1">
          {all.map((item) => {
            const active = isNavActive(pathname, item);
            return (
              <NavLink
                key={item.path}
                to={item.path}
                aria-label={item.label}
                aria-current={active ? "page" : undefined}
                className={`relative px-3.5 py-1.5 text-sm font-medium rounded-full transition-colors whitespace-nowrap active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 ${
                  active ? "text-accent bg-accent-light" : "text-text-secondary hover:text-text-primary hover:bg-hover"
                }`}
              >
                {item.label}
              </NavLink>
            );
          })}
        </div>
        <div className="ml-auto">
          <button
            type="button"
            aria-label={t("settings")}
            onClick={onSettingsOpen}
            className="p-2 text-text-secondary hover:text-text-primary rounded-full hover:bg-hover transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <Settings size={16} />
          </button>
        </div>
      </div>
    </nav>
  );
}

// ---- client/components/layout/MobileNav.tsx ----
interface MobileNavProps {
  onMoreOpen: () => void;
  onSettingsOpen: () => void;
}

/** Fixed bottom navigation bar for mobile; primary items plus a "More" button. */
export function MobileNav({ onMoreOpen, onSettingsOpen }: MobileNavProps) {
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { mobilePrimary, mobileMore } = useNavigation();

  // Highlight "More" when the current route belongs to a secondary (collapsed) nav item.
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
            className={`w-20 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full ${active ? "text-accent" : "text-text-secondary"}`}
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
        className={`w-20 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full ${isMoreActive ? "text-accent" : "text-text-secondary"}`}
      >
        <MoreHorizontal size={18} />
        <span>{t("more")}</span>
      </button>
      <button
        type="button"
        onClick={onSettingsOpen}
        aria-label={t("settings")}
        className="w-20 flex flex-col items-center justify-center gap-0.5 text-[11px] font-medium transition-colors text-text-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 rounded-full"
      >
        <Settings size={18} />
        <span>{t("settings")}</span>
      </button>
    </nav>
  );
}

// ---- client/components/layout/MobileMoreSheet.tsx ----
interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

const tileClass = (active: boolean) =>
  `flex flex-col items-center gap-1.5 w-20 py-3 rounded-xl text-xs font-medium transition-colors ${
    active ? "bg-selected text-accent" : "text-text-secondary hover:bg-hover"
  }`;

/** Compact floating "More" menu on mobile: icon-tile grid hovering above the bottom nav. */
export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { pathname } = useLocation();
  const { mobileMore } = useNavigation();
  const { t } = useTranslation();

  return (
    <Sheet open={open} onClose={onClose} className="w-auto mb-24 rounded-2xl p-2" ariaLabel={t("navMore")}>
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
