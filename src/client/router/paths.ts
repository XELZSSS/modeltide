/**
 * Every route path the client links to, plus the query param names those links carry. `routes.ts` declares its records
 * from these, and so do the two call sites that build a link by hand: the source back-links in `nav/sources.ts` and the
 * comparison-view switch in the AA rankings tab.
 */
export const PATHS = {
  home: "/",
  rankings: "/models",
  compare: "/compare",
  priceCompare: "/price-compare",
  releases: "/releases",
  news: "/news",
  /** The model detail route. Its `:id` is a whole model path, so the segment pattern is greedy. */
  modelDetail: "/model/:id(.*)",
  /** Prefix form of `modelDetail`, for `activePrefixes`: a nav item matches on the path, not on a route pattern. */
  modelDetailPrefix: "/model/",
} as const;

/** Which rankings tab is open. */
export const TAB_PARAM = "tab";

/** Which sub-view of a tab is open — the AA rankings tab stores its rankings/pricing mode here. */
export const VIEW_PARAM = "view";
