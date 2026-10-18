import { watch } from "vue";
import { useRoute } from "vue-router";
import { DOC_META, type Lang, type TranslationKey } from "@/shared/i18n";
import { useTranslation } from "@/client/i18n";

const ROBOTS_SELECTOR = 'meta[name="robots"]';

export function syncDocumentMeta(lang: Lang): void {
  const locale = DOC_META[lang];
  document.documentElement.lang = locale.html;
  const { t } = useTranslation();
  const description = t("metaDescription");
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

export function useDocumentTitle(): (title: string) => void {
  const { t } = useTranslation();
  return (title) => {
    document.title = `${title} · ${t("appName")}`;
  };
}

export function useDocumentMeta(): void {
  const route = useRoute();
  const { t, lang } = useTranslation();
  const setDocumentTitle = useDocumentTitle();
  // `lang` is part of the watched source: the title is translated, so a language switch must re-set it.
  watch(
    () => [route.name, route.meta.titleKey, lang.value],
    () => {
      if (route.name == null) return;
      const known = route.name !== "notFound";
      const titleKey = (route.meta.titleKey ?? "notFound") as TranslationKey;
      setDocumentTitle(t(known ? titleKey : "notFound"));
      const robots = document.querySelector(ROBOTS_SELECTOR);
      if (known) {
        robots?.remove();
        return;
      }
      if (robots) return;
      const noindex = document.createElement("meta");
      noindex.name = "robots";
      noindex.content = "noindex";
      document.head.appendChild(noindex);
    },
    { immediate: true },
  );
}
