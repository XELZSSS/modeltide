"use client";
import {
  createContext,
  use,
  useCallback,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useSettingsStore } from "@/client/stores";
import { ApiClientError, isAbortError } from "@/client/api/client";
import { FIVE_MINUTES, THIRTY_MINUTES } from "@/shared/config";
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

function syncDocumentMeta(lang: Lang) {
  if (typeof document === "undefined") return;
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

function useIsMobile(breakpoint = 768): boolean {
  const query = `(max-width: ${breakpoint - 1}px)`;
  const mq = useMemo(() => (typeof window !== "undefined" ? window.matchMedia(query) : null), [query]);
  const subscribe = useCallback(
    (onChange: () => void) => {
      if (!mq) return () => {};
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    },
    [mq],
  );
  return useSyncExternalStore(
    subscribe,
    () => mq?.matches ?? false,
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

function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        retry: (count, err) => {
          if (isAbortError(err)) return false;
          if (err instanceof ApiClientError && err.status >= 400 && err.status < 500 && err.status !== 429) {
            return false;
          }
          return count < 2;
        },
        retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 5000),
        refetchOnWindowFocus: false,
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
      <DeviceProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </DeviceProvider>
    </I18nProvider>
  );
}
