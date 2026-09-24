import { useEffect } from "react";
import { findRoute } from "@/client/config/routes";
import { useTranslation } from "@/client/providers";

const ROBOTS_SELECTOR = 'meta[name="robots"]';

export function useDocumentMeta(pathname: string): void {
  const { t } = useTranslation();
  useEffect(() => {
    const route = findRoute(pathname);
    document.title = `${t(route ? route.titleKey : "notFound")} · ${t("appName")}`;
    const robots = document.querySelector(ROBOTS_SELECTOR);
    if (route) {
      robots?.remove();
      return;
    }
    if (robots) return;
    const noindex = document.createElement("meta");
    noindex.name = "robots";
    noindex.content = "noindex";
    document.head.appendChild(noindex);
  }, [pathname, t]);
}
