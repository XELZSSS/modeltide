import { computed, type ComputedRef } from "vue";
import { createT, type Lang, type TFunction } from "@/shared/i18n";
import { useSettingsStore } from "@/client/stores/settings-store";

const translators = new Map<Lang, TFunction>();

function tFor(lang: Lang): TFunction {
  const cached = translators.get(lang);
  if (cached) return cached;
  const translator = createT(
    lang,
    import.meta.env.DEV
      ? {
          onMissingParam: (key, out) => console.warn(`[i18n] missing param for key "${key}": "${out}"`),
          onMissingKey: (key, l) => console.warn(`[i18n] missing key "${key}" for lang "${l}", fell back to en`),
        }
      : undefined,
  );
  translators.set(lang, translator);
  return translator;
}

const DOC_META: Record<Lang, { html: string; og: string; ogAlternate: string }> = {
  zh: { html: "zh-CN", og: "zh_CN", ogAlternate: "en_US" },
  en: { html: "en", og: "en_US", ogAlternate: "zh_CN" },
};

export function syncDocumentMeta(lang: Lang): void {
  const locale = DOC_META[lang];
  document.documentElement.lang = locale.html;
  const description = tFor(lang)("metaDescription");
  for (const selector of [
    'meta[name="description"]',
    'meta[property="og:description"]',
    'meta[name="twitter:description"]',
  ]) {
    document.querySelector(selector)?.setAttribute("content", description);
  }
  document.querySelector('meta[property="og:locale"]')?.setAttribute("content", locale.og);
  document.querySelector('meta[property="og:locale:alternate"]')?.setAttribute("content", locale.ogAlternate);
}

export interface Translation {
  lang: ComputedRef<Lang>;
  t: TFunction;
  setLang: (lang: Lang) => void;
}

export function useTranslation(): Translation {
  const settings = useSettingsStore();
  return {
    lang: computed(() => settings.lang),
    t: (key, params) => tFor(settings.lang)(key, params),
    setLang: (lang) => settings.setLang(lang),
  };
}
