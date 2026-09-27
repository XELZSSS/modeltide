import type { Component } from "vue";
import type { QueryClient } from "@tanstack/vue-query";
import type { TranslationKey } from "@/shared/i18n";

export type NavGroup = "primary" | "secondary";

export interface Prefetchable {
  prefetch: (client: QueryClient) => Promise<void>;
}

export interface RouteNav {
  path: string;
  group: NavGroup;
  labelKey: TranslationKey;
  icon: Component;
  activePrefixes?: readonly string[];
}

declare module "vue-router" {
  interface RouteMeta {
    titleKey?: TranslationKey;
    nav?: RouteNav;
    prefetch?: readonly Prefetchable[];
    load?: () => Promise<unknown>;
  }
}
