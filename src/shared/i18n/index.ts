import { en } from "./en";
import { zh } from "./zh";

export type EnDict = typeof en;

export type Lang = "en" | "zh";
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;
export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

// A language file may lag behind `en`; createT falls back per-key to English.
const dictionaries: Record<Lang, Partial<Record<TranslationKey, string>>> = { en, zh };

/** Replaces {key} placeholders; unknown params are left as-is. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Translate function for the language, falling back to English for missing keys. */
export function createT(
  lang: Lang,
  opts?: { onMissingParam?: (key: TranslationKey, rendered: string) => void },
): TFunction {
  const dict = dictionaries[lang];
  return (key, params) => {
    const template = dict[key] ?? en[key] ?? key;
    const out = interpolate(template, params);
    // Surface missing interpolations via the hook instead of rendering "{count}".
    // (Shared code stays free of import.meta/process checks; callers pass the
    // warn callback for both dev and prod so leaks are visible.)
    if (opts?.onMissingParam && /\{\w+\}/.test(out)) opts.onMissingParam(key, out);
    return out;
  };
}

export { en, zh };
