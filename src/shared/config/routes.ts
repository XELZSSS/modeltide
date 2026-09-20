// Single client route manifest: previously the same paths were hardcoded in
// main.tsx (Routes), navigation.tsx (NavItem) and queries.ts
// (ROUTE_PREFETCH_MAP). Import from here when adding a route.
export const ROUTES = {
  home: "/",
  models: "/models",
  compare: "/compare",
  priceCompare: "/price-compare",
  releases: "/releases",
  news: "/news",
  status: "/status",
  modelDetail: "/model/",
  sourceDetail: "/status/",
} as const;

export type RouteKey = keyof typeof ROUTES;
