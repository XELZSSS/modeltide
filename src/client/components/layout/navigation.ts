import { computed, type Component, type ComputedRef } from "vue";
import { useTranslation } from "@/client/i18n";
import { ROUTES } from "@/client/config/routes";
import { routePrefetchTarget } from "@/client/router/prefetch";
import { usePrefetchIntent, type PrefetchIntent } from "@/client/hooks/use-prefetch-intent";
import type { NavGroup } from "@/client/config/route-meta";

export interface NavItem {
  path: string;
  group: NavGroup;
  label: string;
  icon: Component;
  activePrefixes?: readonly string[];
}

export interface Navigation {
  all: ComputedRef<NavItem[]>;
  mobilePrimary: ComputedRef<NavItem[]>;
  mobileMore: ComputedRef<NavItem[]>;
}

export function useNavigation(): Navigation {
  const { t } = useTranslation();
  const all = computed<NavItem[]>(() =>
    ROUTES.flatMap((route): NavItem[] => {
      const nav = route.meta?.nav;
      if (!nav) return [];
      return [
        {
          path: route.path,
          group: nav.group,
          label: t(nav.labelKey),
          icon: nav.icon,
          activePrefixes: nav.activePrefixes,
        },
      ];
    }),
  );
  return {
    all,
    mobilePrimary: computed(() => all.value.filter((item) => item.group === "primary")),
    mobileMore: computed(() => all.value.filter((item) => item.group === "secondary")),
  };
}

export function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.path) return true;
  if (item.activePrefixes) return item.activePrefixes.some((prefix) => pathname.startsWith(prefix));
  return false;
}

export function usePrefetch(): PrefetchIntent<string> {
  return usePrefetchIntent<string>(routePrefetchTarget);
}
