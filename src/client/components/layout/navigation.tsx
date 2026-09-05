import { type ReactNode, useMemo } from "react";
import { Home, Award, Megaphone, Newspaper, Activity, Settings, MoreHorizontal, X, ChevronRight } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { NavLink, useLocation } from "react-router";
import { Button, Sheet } from "@/client/components/ui";
import { REPO_URL } from "@/shared/config";

// ---- navigation ----
interface NavItem {
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
function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.path) return true;
  if (item.matchPrefix) return item.matchPrefix.some((p) => pathname.startsWith(p));
  return false;
}

// ---- DesktopNav ----
interface DesktopNavProps {
  onSettingsOpen: () => void;
}

const DESKTOP_ICON_BUTTON =
  "p-1.5 text-text-secondary hover:text-text-primary bg-transparent rounded-none transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40";

/** Top bar on desktop (hidden below `md`). */
export function DesktopNav({ onSettingsOpen }: DesktopNavProps) {
  const { pathname } = useLocation();
  const { all } = useNavigation();
  const { t } = useTranslation();

  return (
    <nav
      className="hidden md:flex h-11 shrink-0 items-center border-b border-border bg-bg-primary"
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
                className={`relative px-3 py-1 text-sm font-medium rounded-none transition-colors whitespace-nowrap active:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40 focus-visible:ring-offset-1 ${
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

// ---- MobileNav ----
interface MobileNavProps {
  onMoreOpen: () => void;
  onSettingsOpen: () => void;
}

const MOBILE_BAR_BUTTON =
  "flex-1 flex flex-col items-center justify-center gap-1 text-center text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-accent/40 rounded-none";

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
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className={`${MOBILE_BAR_BUTTON} ${active ? "text-accent" : "text-text-secondary"}`}
    >
      {children}
    </button>
  );
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
      className="md:hidden fixed left-0 right-0 bottom-0 z-30 flex h-16 items-stretch rounded-none border-t border-border bg-bg-primary pb-[env(safe-area-inset-bottom,0px)]"
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
            className={`${MOBILE_BAR_BUTTON} ${active ? "text-accent" : "text-text-secondary"}`}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        );
      })}
      <MobileBarButton active={isMoreActive} onClick={onMoreOpen} label={t("more")}>
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

// ---- MobileMoreSheet ----
interface MobileMoreSheetProps {
  open: boolean;
  onClose: () => void;
}

/** "More" menu mirroring SettingsSheet: same panel, header + divided rows. */
export function MobileMoreSheet({ open, onClose }: MobileMoreSheetProps) {
  const { pathname } = useLocation();
  const { mobileMore } = useNavigation();
  const { t } = useTranslation();

  return (
    <Sheet open={open} onClose={onClose} ariaLabel={t("navMore")}>
      <div className="p-5 flex flex-col gap-5 max-h-[70vh] overflow-y-auto">
        <div className="flex items-center justify-between">
          <p className="ui-card-title">{t("more")}</p>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label={t("close")}>
            <X className="size-4" />
          </Button>
        </div>

        <nav className="divide-y divide-border" aria-label={t("navSecondary")}>
          {mobileMore.map((item) => {
            const active = isNavActive(pathname, item);
            return <NavRow key={item.path} item={item} active={active} onClose={onClose} />;
          })}
        </nav>
      </div>
    </Sheet>
  );
}

function NavRow({ item, active, onClose }: { item: NavItem; active: boolean; onClose: () => void }) {
  return (
    <NavLink
      to={item.path}
      onClick={onClose}
      aria-current={active ? "page" : undefined}
      className={`flex items-center justify-between gap-3 px-4 py-3 transition-colors ${
        active ? "text-accent" : "text-text-primary hover:bg-hover"
      }`}
    >
      <span className="flex items-center gap-2 min-w-0">
        <span className={active ? "text-accent shrink-0" : "text-text-secondary shrink-0"}>{item.icon}</span>
        <span className="text-sm">{item.label}</span>
      </span>
      <ChevronRight size={16} className="text-text-tertiary shrink-0" aria-hidden="true" />
    </NavLink>
  );
}
