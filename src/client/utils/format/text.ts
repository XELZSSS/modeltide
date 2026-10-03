import { BENCHMARK_LABELS } from "@/shared/config";
import type { TFunction, TranslationKey } from "@/shared/i18n";
import { isHttpUrl } from "@/shared/utils/url";
import { isProtocolRelative } from "@/shared/utils/url";

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

// oxlint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f\ufeff]/g;

function stripControlChars(s: string): string {
  return s.replace(CONTROL_CHARS_RE, "");
}

export function safeHref(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  const cleaned = stripControlChars(url);
  if (!cleaned) return undefined;
  if (isProtocolRelative(cleaned)) return undefined;
  if (cleaned.startsWith("/")) return cleaned;
  return isHttpUrl(cleaned) ? cleaned : undefined;
}
