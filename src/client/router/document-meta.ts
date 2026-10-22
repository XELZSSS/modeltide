import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useRoute } from "vue-router";
import { DOC_META, type Lang, type TranslationKey } from "@/shared/i18n";
import { useTranslation } from "@/client/i18n";

const ROBOTS_SELECTOR = 'meta[name="robots"]';

/**
 * Soft 404 state: the route resolved but its content does not exist (unknown model source, or an id that is not in
 * the index). Kept module-level because `useDocumentMeta` owns the title and the robots tag.
 */
const softNotFound = ref(false);

/**
 * Detail views call this when the URL is routable but the thing it points at is missing. The URL is preserved,
 * while the title falls back to the not-found copy and `robots` gets `noindex`, so a soft 404 is not published to
 * crawlers as a real page.
 */
export function useSoftNotFound(missing: MaybeRefOrGetter<boolean>): void {
  watch(
    () => toValue(missing),
    (value) => {
      softNotFound.value = value;
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    softNotFound.value = false;
  });
}

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
  watch(
    () => [route.name, route.meta.titleKey, lang.value, softNotFound.value],
    () => {
      if (route.name == null) return;
      const known = route.name !== "notFound" && !softNotFound.value;
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
