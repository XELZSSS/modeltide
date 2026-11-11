/** The focus ring every interactive element in the client draws. A shared string rather than a CSS `@utility` layer class:
 * a layer class cannot be outranked by the spacing utility a page appends to it (see `@/client/nav/layout`), so the ring
 * would silently lose to `px-3`. Concatenate it into the element's own class string. */
export const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/** The 32px square outlined control the top bar's icon buttons use — search, theme, language, GitHub — as one string, so
 * they cannot drift into "three with an edge and one bare". The focus ring is part of the recipe, not the caller's. */
export const ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-text-secondary ui-motion hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
