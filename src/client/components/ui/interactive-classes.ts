/**
 * The focus ring every interactive element in the client draws. It is a shared string rather than a CSS `@utility`
 * layer class on purpose: a class defined in a layer cannot be outranked by the spacing utility a page appends to it
 * (see `@/client/nav/layout`), so the ring would silently lose to `px-3` and the like. Concatenate it into the element's
 * own class string, and keep an extra `focus-visible:ring-inset` where the ring must stay inside a clipped box.
 */
export const FOCUS_RING = "focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";
