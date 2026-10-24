/*
 * Page skeleton roles. Every page composes these instead of repeating the same width/gutter/gap strings, so the column,
 * its padding and the vertical rhythm stay identical across views.
 *
 * They stay Tailwind class strings rather than `@utility` definitions in src/styles: a page routinely adds its own
 * spacing utility on top (`PAGE_GUTTER` + `pt-6`), and a CSS-layer class would compete with it on cascade order instead
 * of composing with it.
 *
 * The numbers follow the reference dashboard: one centred 7xl column, gutters stepping 4 → 6 → 8, a 4/6 stack gap.
 */

export const PAGE_WIDTH = "mx-auto w-full max-w-7xl";

export const PAGE_GUTTER = "px-4 sm:px-6 lg:px-8";

export const PAGE_BLOCK_GAP = "flex flex-col gap-5 sm:gap-6";

export const DETAIL_BLOCK_GAP = "flex flex-col gap-4 sm:gap-5";

/* Rows are 14px text with a 10px vertical pad, which lands on the 40px row height the reference tables use. */
export const ROW_PADDING = "px-4 py-2.5";
