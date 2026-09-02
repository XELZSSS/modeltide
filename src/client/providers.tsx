import { createContext, use, useEffect, useMemo, type ReactNode } from "react";
import { useSettingsStore } from "@/client/stores";
import { useIsMobile } from "@/client/hooks";
import type { Lang, TFunction } from "@/shared/i18n";
import { createT } from "@/shared/i18n";

// ============================================================================
// I18n
// ============================================================================

interface I18nContextValue {
  lang: Lang;
  t: TFunction;
  toggleLang: () => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

/** Reads the i18n context; must be used inside an I18nProvider. */
export function useTranslation() {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}

// Mirror the active language into <html lang> and the meta description for SEO and a11y.
function syncDocumentMeta(lang: Lang) {
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    desc.setAttribute("content", createT(lang)("metaDescription"));
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSettingsStore((s) => s.lang);
  const toggleLang = useSettingsStore((s) => s.toggleLang);

  useEffect(() => {
    syncDocumentMeta(lang);
  }, [lang]);

  // Rebuild the translator bound to the current language only when the language changes.
  const t = useMemo(() => createT(lang), [lang]);

  const contextValue = useMemo<I18nContextValue>(() => ({ lang, t, toggleLang }), [lang, t, toggleLang]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

// ============================================================================
// Device
// ============================================================================

const MOBILE_BREAKPOINT = 768;

interface DeviceContextValue {
  isMobile: boolean;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile(MOBILE_BREAKPOINT);
  const value = useMemo(() => ({ isMobile }), [isMobile]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

/** Device info; must be used inside a DeviceProvider. */
export function useDevice(): DeviceContextValue {
  const ctx = use(DeviceContext);
  if (!ctx) throw new Error("useDevice must be used within a DeviceProvider");
  return ctx;
}
