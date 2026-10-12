import { computed, type ComputedRef } from "vue";
import { createT, DOC_META, type Lang, type TFunction } from "@/shared/i18n";
import { useSettingsStore } from "@/client/stores/settings-store";

export { syncDocumentMeta } from "@/client/router/document-meta";

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

export { DOC_META };

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
