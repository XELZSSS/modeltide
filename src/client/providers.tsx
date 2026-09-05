import { createContext, use, useCallback, useEffect, useMemo, useSyncExternalStore, type ReactNode } from "react";
import { useSettingsStore } from "@/client/stores";
import type { Lang, TFunction } from "@/shared/i18n";
import { createT } from "@/shared/i18n";

interface I18nContextValue {
  lang: Lang;
  t: TFunction;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useTranslation() {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}

// Mirror the language into <html lang> and the meta description.
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
  const setLang = useSettingsStore((s) => s.setLang);

  useEffect(() => {
    syncDocumentMeta(lang);
  }, [lang]);

  // Warn when a key renders with an uninterpolated "{param}" (dev + prod:
  // prod leaks like "{count}" are user-visible and must be caught).
  const t = useMemo(
    () =>
      createT(lang, {
        onMissingParam: (key, out) => console.warn(`[i18n] missing param for key "${key}": "${out}"`),
      }),
    [lang],
  );

  const contextValue = useMemo<I18nContextValue>(
    () => ({ lang, t, toggleLang, setLang }),
    [lang, t, toggleLang, setLang],
  );

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

const MOBILE_BREAKPOINT = 768;

/** True while the viewport is narrower than `breakpoint`. */
function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const subscribe = useCallback(
    (onChange: () => void) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [query],
  );
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(query).matches,
    () => false,
  );
}

interface DeviceContextValue {
  isMobile: boolean;
}

const DeviceContext = createContext<DeviceContextValue | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const isMobile = useIsMobile(MOBILE_BREAKPOINT);
  const value = useMemo(() => ({ isMobile }), [isMobile]);
  return <DeviceContext.Provider value={value}>{children}</DeviceContext.Provider>;
}

export function useDevice(): DeviceContextValue {
  const ctx = use(DeviceContext);
  if (!ctx) throw new Error("useDevice must be used within a DeviceProvider");
  return ctx;
}
