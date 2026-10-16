import { BENCHMARK_LABELS } from "@/shared/config/benchmarks";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import { safeHref } from "./url";

export function formatBoolean(value: boolean | null | undefined, t: TFunction) {
  if (value === true) return t("yes");
  if (value === false) return t("no");
  return t("notAvailable");
}

export function orNA(value: string | null | undefined, t: TFunction): string {
  return value || t("notAvailable");
}

const CAT_MAP: Record<string, TranslationKey> = {
  coding: "catCoding",
  reasoning: "catReasoning",
} as const satisfies Record<string, TranslationKey>;

export function categoryLabel(cat: string, t: TFunction): string {
  const mapped = Object.hasOwn(CAT_MAP, cat) ? CAT_MAP[cat] : undefined;
  return t(mapped ?? "catGeneral");
}

export function benchmarkLabel(key: string, t: TFunction): string {
  const labelKey = Object.hasOwn(BENCHMARK_LABELS, key)
    ? (BENCHMARK_LABELS as Record<string, TranslationKey>)[key]
    : undefined;
  return labelKey ? t(labelKey) : key;
}

export { safeHref };
