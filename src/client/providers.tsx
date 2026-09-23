import { createContext, use, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
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

const DOC_META: Record<Lang, { html: string; og: string; ogAlternate: string }> = {
  zh: { html: "zh-CN", og: "zh_CN", ogAlternate: "en_US" },
  en: { html: "en", og: "en_US", ogAlternate: "zh_CN" },
};

/** index.html ships the zh copy of these tags and its pre-paint script owns documentElement.lang
 *  at first paint; from mount on this is the writer of all of them. */
function syncDocumentMeta(lang: Lang) {
  if (typeof document === "undefined") return;
  const locale = DOC_META[lang];
  document.documentElement.lang = locale.html;
  const description = createT(lang)("metaDescription");
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

/** Mirrors Tailwind's `md`, declared as --breakpoint-md in src/styles/theme.css. */
const MOBILE_QUERY = "(max-width: 767px)";

let mobileMedia: MediaQueryList | null | undefined;
const mobileSubscribers = new Set<() => void>();

function mobileMediaQuery(): MediaQueryList | null {
  if (mobileMedia === undefined) {
    mobileMedia =
      typeof window !== "undefined" && typeof window.matchMedia === "function" ? window.matchMedia(MOBILE_QUERY) : null;
  }
  return mobileMedia;
}

function notifyMobile(): void {
  for (const listener of mobileSubscribers) listener();
}

/** One `matchMedia` subscription for the whole page: the shell mounts `useDevice` many times, and
 *  a listener per call would mean a media-query listener per call. */
function subscribeMobile(listener: () => void): () => void {
  const media = mobileMediaQuery();
  if (!media) return () => {};
  if (mobileSubscribers.size === 0) media.addEventListener("change", notifyMobile);
  mobileSubscribers.add(listener);
  return () => {
    mobileSubscribers.delete(listener);
    if (mobileSubscribers.size === 0) media.removeEventListener("change", notifyMobile);
  };
}

export function useDevice(): { isMobile: boolean } {
  const isMobile = useSyncExternalStore(
    subscribeMobile,
    () => mobileMediaQuery()?.matches ?? false,
    () => false,
  );
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
