export const THEME_COLORS = { light: "#ffffff", dark: "#09090b" } as const;

/**
 * The light-mode chart palette, mirrored as `--chart-1...10` / `--donut-1...6` in `src/styles/theme.css` so the Canvas
 * fallback in `src/client/charts/theme.ts` and the stylesheet share one definition; the consistency guard fails the build
 * when the two drift. Every entry has to clear WCAG's floor for a graphical object against the card it is drawn on, which
 * is also why this scale departs from shadcn's `--chart-*` set. Hues are ordered so neighbours in a legend never share a
 * family: orange, teal, navy, amber, cyan, pink, crimson, green, blue, grey.
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
 * of table rows, sheets that own the bottom edge. `src/styles/motion.css` and `utilities.css` state the same boundary
 * from either side, and `build/consistency-guard.ts` pins both files to this number.
 */
export const MOBILE_MAX_WIDTH_PX = 767;

/**
 * Row counts for the home dashboard's cards: the server slices each `HomeDashboardData` list to the count below and the
 * client renders the rows it receives, so no card re-derives a cap the payload already applied. `HOME_CHART_ROWS` also
 * sets how thick each bar can be - fourteen gives a ~100px slot on a 1600px screen, where seven would draw a slab.
 */
export const HOME_CHART_ROWS = 14;
export const HOME_CODING_AGENT_ROWS = 5;
export const HOME_OPEN_SOURCE_ROWS = 5;
export const HOME_PROVIDER_ROWS = 5;
export const HOME_HALLUCINATION_ROWS = 5;
export const HOME_USAGE_ROWS = 5;
export const HOME_DECISION_ROWS = 5;
export const HOME_CURSORBENCH_ROWS = 5;
