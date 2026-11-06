export const THEME_COLORS = { light: "#ffffff", dark: "#09090b" } as const;

/**
 * The light-mode chart palette, mirrored as `--chart-1…10` / `--donut-1…6` in `src/styles/theme.css` so the Canvas
 * fallback in `src/client/charts/theme.ts` and the stylesheet share one definition; the consistency guard fails the
 * build when the two drift.
 *
 * Every entry clears 3:1 against the card it is drawn on (WCAG's floor for a graphical object): the bar or line *is*
 * the information, so a series that fades into its surface is a defect, not a style choice. That is also why this scale
 * departs from shadcn's `--chart-*` set — its yellow (#ffb900, 1.7:1) and amber (#fe9a00, 2.1:1) only work as
 * decorative fills. Hues are ordered so neighbours in a legend or a two-series chart never share a family:
 * orange → teal → navy → amber → cyan → pink → crimson → green → blue → grey. The palette carried a violet
 * (#ad46ff, OKLCH hue 305) in the sixth slot until it moved to the nearest rose at hue 345 (#e12ca7) — violet and
 * lavender are the one hue family the design system refuses, even in data.
 *
 * The dark scale lives in `theme.css` alone, held to the same floor against the dark card (#18181b).
 */
export const CHART_PALETTE = [
  "#f54900",
  "#009689",
  "#104e64",
  "#b45309",
  "#0e7490",
  "#e12ca7",
  "#ff2056",
  "#059669",
  "#1447e6",
  "#71717b",
] as const;

export const DONUT_PALETTE = ["#f54900", "#009689", "#104e64", "#b45309", "#e12ca7", "#71717b"] as const;

type SupportedLocale = "zh-CN" | "en-US";

export function localeOf(lang: string): SupportedLocale {
  return lang === "zh" ? "zh-CN" : "en-US";
}

export const FALLBACK_DASH = "—";
export const FALLBACK_NA = "N/A";

export const MODALITY_KEYS = ["text", "image", "speech", "video"] as const;

export type ModalityKey = (typeof MODALITY_KEYS)[number];

/**
 * The widest viewport the shell renders as a phone: bottom navigation instead of the desktop rail, card tables instead
 * of table rows, sheets that slide up from the bottom edge.
 *
 * `src/styles/motion.css` and `src/styles/scrollbar.css` state the same boundary as `width < 768px` — one pixel above
 * this — and `build/consistency-guard.ts` pins both files to this number. A `matchMedia` string and a stylesheet share
 * no value any other way, and the two used to agree only because a comment pointed at the other half: move one and the
 * sheet keeps fading in at a width the shell no longer calls a phone.
 */
export const MOBILE_MAX_WIDTH_PX = 767;

/**
 * Row counts for the home dashboard's cards. The server slices each `HomeDashboardData` list to the count below and the
 * client renders the rows it receives, so no card re-derives a cap the payload already applied: one definition, one
 * slice. They live in `src/shared` because both sides read them — a comment pinning two literals together cannot fail a
 * build, which is how one card came to draw five rows of a payload that carried eight.
 *
 * `HOME_CHART_ROWS` also decides how thick each bar can be. The card spans the whole page column, so seven categories
 * would take a slot of about 200px on a 1600px screen and draw a slab rather than a bar; fourteen halves the slot to
 * ~100px — the density the chart was drawn for — and doubles what the overview shows at the same time.
 */
export const HOME_CHART_ROWS = 14;
export const HOME_CODING_AGENT_ROWS = 5;
export const HOME_OPEN_SOURCE_ROWS = 5;
export const HOME_PROVIDER_ROWS = 5;
export const HOME_HALLUCINATION_ROWS = 5;
export const HOME_USAGE_ROWS = 5;
export const HOME_DECISION_ROWS = 5;
