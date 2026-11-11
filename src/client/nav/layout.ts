/*
 * Page skeleton roles. Every page composes these instead of repeating the same width/gutter/gap strings. They stay
 * Tailwind class strings rather than `@utility` definitions in src/styles: a page routinely adds its own spacing utility
 * on top, and a CSS-layer class would compete with it on cascade order. The cap is the reference dashboard's effective
 * width on a wide screen; gutters step up per breakpoint, and the block gaps stay fixed.
 */

export const PAGE_WIDTH = "mx-auto w-full max-w-[1600px]";

export const PAGE_GUTTER = "px-4 sm:px-6 lg:px-8 2xl:px-12";

export const PAGE_BLOCK_GAP = "flex flex-col gap-5 sm:gap-6";

export const DETAIL_BLOCK_GAP = "flex flex-col gap-4 sm:gap-5";

/* Rows are body text with a vertical pad that lands on the row height the reference tables use. */
export const ROW_PADDING = "px-4 py-2.5";
