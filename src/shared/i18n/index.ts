import { en } from "./en";
import { zh } from "./zh";

// Lightweight, type-safe i18n: dictionaries plus a small interpolation helper.
export type EnDict = typeof en;

export type Lang = "en" | "zh";
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;
export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, zh };

/** Replaces {key} placeholders in a template; unknown or null params are left as-is. */
export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

/** Returns a translate function for the language, falling back to English for missing keys. */
export function createT(lang: Lang): TFunction {
  const dict = dictionaries[lang];
  return (key, params) => interpolate(dict[key] ?? en[key] ?? key, params);
}

export { en, zh };
