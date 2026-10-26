import { en } from "./en.ts";
import { zh } from "./zh.ts";

export type Lang = "en" | "zh";
export type TranslationKey = keyof typeof en;
type TranslationParams = Record<string, string | number>;
export type TFunction = (key: TranslationKey, params?: TranslationParams) => string;

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, zh };

export const DOC_META: Record<Lang, { html: string; og: string; ogAlternate: string }> = {
  zh: { html: "zh-CN", og: "zh_CN", ogAlternate: "en_US" },
  en: { html: "en", og: "en_US", ogAlternate: "zh_CN" },
};

function interpolate(template: string, params?: TranslationParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = params[key];
    return value === undefined || value === null ? match : String(value);
  });
}

export function createT(
  lang: Lang,
  opts?: {
    onMissingParam?: (key: TranslationKey, rendered: string) => void;
    onMissingKey?: (key: string, lang: Lang) => void;
  },
): TFunction {
  const dict = dictionaries[lang];
  return (key, params) => {
    const template = dict[key] ?? en[key] ?? key;
    if (!(key in dict) && opts?.onMissingKey) opts.onMissingKey(key, lang);
    const out = interpolate(template, params);
    if (opts?.onMissingParam && /\{\w+\}/.test(out)) opts.onMissingParam(key, out);
    return out;
  };
}
