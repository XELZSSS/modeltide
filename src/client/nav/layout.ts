/*
 * Page skeleton roles. Every page composes these instead of repeating the same width/gutter/gap strings, so the column,
 * its padding and the vertical rhythm stay identical across views.
 *
 * They stay Tailwind class strings rather than `@utility` definitions in src/styles: a page routinely adds its own
 * spacing utility on top (`PAGE_GUTTER` + `pt-6`), and a CSS-layer class would compete with it on cascade order instead
 * of composing with it.
 *
 * The width follows the reference dashboard rather than a text column: artificialanalysis.ai lays its content out as
 * `18rem + minmax(0, 1fr)` with no page-level cap, so on a 1920 screen its data column runs about 1580px wide. This
 * shell has the navigation on top instead of beside, so it keeps a cap — 1600px, the same effective width on the same
 * screen — instead of stretching a five-column table across an ultrawide monitor. Gutters step 4 → 6 → 8 → 12, and the
 * block gaps stay 4/6.
 */

export const PAGE_WIDTH = "mx-auto w-full max-w-[1600px]";

export const PAGE_GUTTER = "px-4 sm:px-6 lg:px-8 2xl:px-12";

export const PAGE_BLOCK_GAP = "flex flex-col gap-5 sm:gap-6";

export const DETAIL_BLOCK_GAP = "flex flex-col gap-4 sm:gap-5";

/* Rows are 14px text with a 10px vertical pad, which lands on the 40px row height the reference tables use. */
export const ROW_PADDING = "px-4 py-2.5";
