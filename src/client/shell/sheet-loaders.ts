// The settings and more sheets sit outside the first-load bundle: they are only reachable from a tap and their chunk
// carries the shared focus-trap code. `bootstrap` warms both chunks once the page is idle so the first tap still opens
// immediately, and `app-shell` mounts each sheet on first open, keeping it mounted afterwards so the exit transition
// can play. Keep both sides on these loaders so the prefetch and the lazy component share one chunk.
export const loadSettingsSheet = () => import("./settings-sheet.vue");
export const loadMobileMoreSheet = () => import("./mobile-more-sheet.vue");
