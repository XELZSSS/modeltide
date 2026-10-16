export {
  formatIndex,
  formatPercent,
  formatScore,
  formatShortNumber,
  formatSpeed,
  formatTokens,
  formatTrend,
} from "./number";
export { formatDollar, formatPricePerMillion } from "./money";
export { formatDate, formatRelativeTime } from "./time";
export { benchmarkLabel, categoryLabel, formatBoolean, orNA, safeHref } from "./text-format";
export { hexToRgba } from "./color";

// Barrel: prefer deep imports inside shared/ to avoid cycles; this barrel is for
// external (client/server/functions) consumers.
export { computeBlendPrice, monthlyCostFor, type CostScenario } from "./cost";
export { isFiniteNumber, clampedPercent, unclampedPercent, approxEq } from "./number";
export { dedupeBy, toStringOrNull, normalizeModelKey, errMsg, titleCase } from "./text";
export { resolveEffectivePricing, PRICE_LEGS, PRICE_LEG_IDS, type EffectivePricing } from "./pricing";
export * from "./models";
export * from "./hallucination";
export * from "./url";
export * from "./release-feed";
