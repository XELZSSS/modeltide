/**
 * The focus ring every interactive element in the client draws. It is a shared string rather than a CSS `@utility`
 * layer class on purpose: a class defined in a layer cannot be outranked by the spacing utility a page appends to it
 * (see `@/client/nav/layout`), so the ring would silently lose to `px-3` and the like. Concatenate it into the element's
 * own class string, and keep an extra `focus-visible:ring-inset` where the ring must stay inside a clipped box.
 */
export const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

/**
 * The 32px square outlined control the top bar's icon buttons use — search, theme, language, GitHub. One string for all
 * four, so they cannot drift into "three with an edge and one bare": a row of icons reads as a row only when its members
 * share a box, and an unbordered button next to bordered ones looks like a different kind of control.
 *
 * The focus ring is part of the recipe rather than concatenated by each caller: this is a complete button, not a token.
 */
export const ICON_BUTTON =
  "inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-border text-text-secondary ui-motion hoverable:hover:bg-surface-hover hoverable:hover:text-text-primary focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
