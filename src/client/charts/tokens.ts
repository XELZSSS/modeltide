export interface ChartTheme {
  grid: string;
  tick: string;
  tickSecondary: string;
  tooltipBg: string;
  tooltipText: string;
  palette: string[];
  donut: string[];
}

export const DONUT_FALLBACK = ["#365899", "#1e2430", "#2f6d8a", "#2f7a4d", "#9a6b0a", "#9aa5b4"];

export const FALLBACK_THEME: ChartTheme = {
  grid: "rgba(30, 36, 48, 0.14)",
  tick: "#8b96a5",
  tickSecondary: "#5b6675",
  tooltipBg: "#f1f4f7",
  tooltipText: "#1e2430",
  palette: [
    "#365899",
    "#1e2430",
    "#5b6675",
    "#9aa5b4",
    "#2f7a4d",
    "#2f6d8a",
    "#9a6b0a",
    "#c03a30",
    "#6d7a99",
    "#c3ccd6",
  ],
  donut: DONUT_FALLBACK,
};

export const CHART_HEIGHT = "h-[160px] sm:h-[180px]";

export const FLEX_CHART_HEIGHT = `flex-1 min-h-[160px] ${CHART_HEIGHT}`;

export const RADAR_CHART_HEIGHT = "h-[280px] sm:h-[400px]";

export const CHART_EMPTY_CLASS = "flex items-center justify-center text-center ui-body-secondary";
