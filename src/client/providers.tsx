import { createContext, use, useEffect, useMemo, useState, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettingsStorageSync, useSettingsStore } from "@/client/stores";
import { ApiClientError, isAbortError } from "@/client/api/api-client";
import { FIVE_MINUTES, THIRTY_MINUTES } from "@/shared/config";
import type { Lang, TFunction } from "@/shared/i18n";
import { createT } from "@/shared/i18n";

interface I18nContextValue {
  lang: Lang;
  t: TFunction;
  setLang: (lang: Lang) => void;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function useTranslation() {
  const ctx = use(I18nContext);
  if (!ctx) throw new Error("useTranslation must be used within I18nProvider");
  return ctx;
}

function syncDocumentMeta(lang: Lang) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = lang === "zh" ? "zh-CN" : "en";
  const desc = document.querySelector('meta[name="description"]');
  if (desc) {
    desc.setAttribute("content", createT(lang)("metaDescription"));
  }
}

function I18nProvider({ children }: { children: ReactNode }) {
  const lang = useSettingsStore((s) => s.lang);
  const setLang = useSettingsStore((s) => s.setLang);
  useSettingsStorageSync();

  useEffect(() => {
    syncDocumentMeta(lang);
  }, [lang]);

  const t = useMemo(
    () =>
      createT(lang, {
        onMissingParam: (key, out) => console.warn(`[i18n] missing param for key "${key}": "${out}"`),
        onMissingKey: (key, l) => console.warn(`[i18n] missing key "${key}" for lang "${l}", fell back to en`),
      }),
    [lang],
  );

  const contextValue = useMemo<I18nContextValue>(() => ({ lang, t, setLang }), [lang, t, setLang]);

  return <I18nContext.Provider value={contextValue}>{children}</I18nContext.Provider>;
}

const MOBILE_QUERY = "(max-width: 767px)";

export function useDevice(): { isMobile: boolean } {
  const [isMobile, setIsMobile] = useState<boolean>(() =>
    typeof window !== "undefined" && typeof window.matchMedia === "function"
      ? window.matchMedia(MOBILE_QUERY).matches
      : false,
  );
  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    const mq = window.matchMedia(MOBILE_QUERY);
    const onChange = () => setIsMobile(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return useMemo(() => ({ isMobile }), [isMobile]);
}

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => {
          if (isAbortError(err)) return false;
          if (err instanceof ApiClientError) {
            const status = err.status;
            if (status >= 400 && status < 500 && status !== 429 && status !== 408) return false;
          }
          return count < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
        refetchOnWindowFocus: true,
        staleTime: FIVE_MINUTES,
        gcTime: THIRTY_MINUTES,
      },
    },
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(createQueryClient);
  return (
    <I18nProvider>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </I18nProvider>
  );
}
