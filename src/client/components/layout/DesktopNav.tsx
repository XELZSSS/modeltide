import { NavLink, useLocation } from "react-router";
import { Settings } from "lucide-react";
import { useTranslation } from "@/client/providers";
import { useNavigation, isNavActive } from "./navigation";

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
