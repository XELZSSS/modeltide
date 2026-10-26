import { onScopeDispose, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { useRoute } from "vue-router";
import { DOC_META, type Lang, type TranslationKey } from "@/shared/i18n";
import { useTranslation } from "@/client/i18n";

const ROBOTS_SELECTOR = 'meta[name="robots"]';

/**
 * Soft 404 state: the route resolved but its content does not exist (unknown model source, or an id that is not in
 * the index). Kept module-level because `useDocumentMeta` owns the title and the robots tag.
 */
const softNotFound = ref(false);
const SOFT_NOT_FOUND_OWNER = { n: 0 };

/**
 * Title a detail view wants instead of the route's generic one — a model name, so the tab keeps it across a
 * language switch. Owned here for the same reason as `softNotFound`: `useDocumentMeta` is the only writer of
 * `document.title`, so nothing else may overwrite the model name with the generic route title.
 */
const detailTitle = ref<string | null>(null);
const DETAIL_TITLE_OWNER = { n: 0 };

/**
 * Writes `target` from `read` while this scope owns `owner`, and restores `cleared` on dispose. Keyed by owner because
 * the incoming detail view mounts before the outgoing one unmounts: a stale instance may neither set nor clear it.
 */
function useOwnedWrite<T>(target: Ref<T>, owner: { n: number }, read: () => T, cleared: T): void {
  const self = ++owner.n;
  watch(
    read,
    (value) => {
      if (self === owner.n) target.value = value;
    },
    { immediate: true },
  );
  onScopeDispose(() => {
    if (self === owner.n) target.value = cleared;
  });
}

/**
 * Detail views call this when the URL is routable but the thing it points at is missing. The URL is preserved, while
 * the title falls back to the not-found copy and `robots` gets `noindex`, so a soft 404 is not published to crawlers as
 * a real page.
 */
export function useSoftNotFound(missing: MaybeRefOrGetter<boolean>): void {
  useOwnedWrite(softNotFound, SOFT_NOT_FOUND_OWNER, () => toValue(missing), false);
}

/**
 * Registers the title the current detail view shows — a model name, so the tab keeps it across a language switch.
 * Owned for the same reason as `softNotFound`: `useDocumentMeta` is the only writer of `document.title`.
 */
export function useDocumentViewTitle(title: MaybeRefOrGetter<string>): void {
  useOwnedWrite(detailTitle, DETAIL_TITLE_OWNER, () => toValue(title), null);
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

function useDocumentTitle(): (title: string) => void {
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
    () => [route.name, route.meta.titleKey, lang.value, softNotFound.value, detailTitle.value],
    () => {
      if (route.name == null) return;
      const known = route.name !== "notFound" && !softNotFound.value;
      const titleKey = (route.meta.titleKey ?? "notFound") as TranslationKey;
      setDocumentTitle(known ? (detailTitle.value ?? t(titleKey)) : t("notFound"));
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
