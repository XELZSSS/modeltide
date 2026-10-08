// Barrel: prefer deep imports inside shared/ to avoid cycles; this barrel is for
// external (client/server/worker) consumers.
export { computeBlendPrice, monthlyCostFor, type CostScenario } from "@/shared/utils/cost";
export { isFiniteNumber, clampedPercent, unclampedPercent, approxEq } from "@/shared/utils/numbers";
export { dedupeBy, toStringOrNull, normalizeModelKey, errMsg, titleCase } from "@/shared/utils/text";
export { resolveEffectivePricing, PRICE_LEGS, PRICE_LEG_IDS, type EffectivePricing } from "@/shared/utils/pricing";
export * from "@/shared/utils/models";
export * from "@/shared/utils/hallucination";
export * from "@/shared/utils/url";
export * from "@/shared/utils/release-feed";
export { resolveLevel, recentlyDegradedIds } from "@/shared/utils/status-level";
