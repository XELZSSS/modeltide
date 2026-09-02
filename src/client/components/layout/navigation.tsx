import { type ReactNode, useMemo } from "react";
import { Home, Award, Megaphone, Newspaper, Activity } from "lucide-react";
import { useTranslation } from "@/client/providers";

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
