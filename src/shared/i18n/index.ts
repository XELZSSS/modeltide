import { en } from "./en";
import { zh } from "./zh";

export type Lang = "en" | "zh";
export type TranslationKey = keyof typeof en;
export type TranslationParams = Record<string, string | number>;
export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, zh };

export function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function createT(
  lang: Lang,
  opts?: { onMissingParam?: (key: TranslationKey, rendered: string) => void },
): TFunction {
  const dict = dictionaries[lang];
  return (key, params) => {
    const template = dict[key] ?? en[key] ?? key;
    const out = interpolate(template, params);
    if (opts?.onMissingParam && /\{\w+\}/.test(out)) opts.onMissingParam(key, out);
    return out;
  };
}
