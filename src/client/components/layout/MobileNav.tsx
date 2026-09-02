import { NavLink, useLocation } from "react-router";
import { MoreHorizontal, Settings } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useNavigation, isNavActive } from "./navigation";

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
