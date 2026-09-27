import { watch } from "vue";
import { useRoute } from "vue-router";
import type { TranslationKey } from "@/shared/i18n";
import { useTranslation } from "@/client/i18n";

const ROBOTS_SELECTOR = 'meta[name="robots"]';

export function useDocumentMeta(): void {
  const route = useRoute();
  const { t } = useTranslation();
  watch(
    () => [route.name, route.fullPath],
    () => {
      if (route.name == null) return;
      const known = route.name !== "notFound";
      const titleKey = (route.meta.titleKey ?? "notFound") as TranslationKey;
      document.title = `${t(known ? titleKey : "notFound")} · ${t("appName")}`;
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
