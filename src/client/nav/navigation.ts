import { computed, type Component, type ComputedRef } from "vue";
import { useRoute } from "vue-router";
import { useTranslation } from "@/client/i18n";
import { ROUTES } from "@/client/router/routes";
import type { NavGroup } from "@/client/router/route-meta";

export { usePrefetch } from "@/client/hooks/use-prefetch";

interface NavItem {
  path: string;
  group: NavGroup;
  label: string;
  icon: Component;
  activePrefixes?: readonly string[];
}

interface Navigation {
  all: ComputedRef<NavItem[]>;
  mobilePrimary: ComputedRef<NavItem[]>;
  mobileMore: ComputedRef<NavItem[]>;
  isActive: (item: NavItem) => boolean;
}

export function useNavigation(): Navigation {
  const { t } = useTranslation();
  const route = useRoute();
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
  const activePaths = computed(() => {
    const active = new Set<string>();
    const current = route.path;
    for (const item of all.value) {
      if (isNavActive(current, item)) active.add(item.path);
    }
    return active;
  });
  const isActive = (item: NavItem): boolean => activePaths.value.has(item.path);
  return {
    all,
    mobilePrimary: computed(() => all.value.filter((item) => item.group === "primary")),
    mobileMore: computed(() => all.value.filter((item) => item.group === "secondary")),
    isActive,
  };
}

function isNavActive(pathname: string, item: NavItem): boolean {
  if (pathname === item.path) return true;
  if (item.activePrefixes) return item.activePrefixes.some((prefix) => pathname.startsWith(prefix));
  return false;
}
