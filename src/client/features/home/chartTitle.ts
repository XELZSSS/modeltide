import type { TFunction } from "@/shared/i18n";

/**
 * Heading of the intelligence chart, shared by the chart and its Suspense fallback.
 * Lives in its own module so HomeView can render the fallback without statically
 * importing the chart module (which would defeat the lazy chunk split).
 */
export function intelligenceChartTitle(t: TFunction): string {
  return t("intelligenceIndex");
}
