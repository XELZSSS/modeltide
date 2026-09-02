import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import { useEffect } from "react";
import type { ThemeMode } from "@/shared/types";
import type { Lang } from "@/shared/i18n";
import { STORAGE_KEYS } from "@/shared/config";
import { safeLocalStorage } from "./storage";

type LangToggle = (s: Lang) => Lang;
const toggleLang: LangToggle = (lang) => (lang === "en" ? "zh" : "en");
type ThemeToggle = (s: ThemeMode) => ThemeMode;
const toggleThemeMode: ThemeToggle = (mode) => (mode === "light" ? "dark" : "light");

interface SettingsState {
  themeMode: ThemeMode;
  lang: Lang;
  toggleTheme: () => void;
  toggleLang: () => void;
  setLang: (lang: Lang) => void;
  setThemeMode: (mode: ThemeMode) => void;
}

/**
 * Single persisted settings store (theme + language). Zustand selectors keep
 * consumers render-isolated: a lang change does not re-render theme-only
 * subscribers.
 */
export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      // Default follows the OS color scheme; the persisted user choice overrides it later.
      themeMode:
        typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light",
      // Default to Chinese; the persisted choice wins on next load.
      lang: "zh",
      toggleTheme: () => set((s) => ({ themeMode: toggleThemeMode(s.themeMode) })),
      toggleLang: () => set((s) => ({ lang: toggleLang(s.lang) })),
      setLang: (lang) => set(() => ({ lang })),
      setThemeMode: (themeMode) => set(() => ({ themeMode })),
    }),
    {
      name: STORAGE_KEYS.settings,
      storage: createJSONStorage(safeLocalStorage),
      onRehydrateStorage: () => (_state, error) => {
        if (error) console.warn("[settings] rehydrate failed", error);
      },
      // Merge strategy keeps defaults for keys absent from older persisted blobs,
      // and drops unknown/corrupt values (e.g. {themeMode:"blue", lang:"fr"}).
      merge: (persisted, current) => {
        const p = (persisted ?? {}) as Partial<SettingsState>;
        return {
          ...current,
          themeMode: p.themeMode === "dark" || p.themeMode === "light" ? p.themeMode : current.themeMode,
          lang: p.lang === "zh" || p.lang === "en" ? p.lang : current.lang,
        };
      },
    },
  ),
);

/**
 * Cross-tab settings sync: when another tab persists new settings, the
 * `storage` event fires here and we adopt the foreign state. Listener is
 * mounted once (AppShell); current values are read via getState() inside.
 */
export function useThemeStorageSync(): void {
  useEffect(() => {
    const onStorage = (e: StorageEvent): void => {
      if (e.key !== STORAGE_KEYS.settings || e.newValue == null) return;
      try {
        const parsed = JSON.parse(e.newValue) as { state?: { themeMode?: ThemeMode; lang?: Lang } };
        const foreignTheme = parsed.state?.themeMode;
        if (foreignTheme === "dark" || foreignTheme === "light") {
          if (useSettingsStore.getState().themeMode !== foreignTheme) {
            useSettingsStore.setState({ themeMode: foreignTheme });
          }
        }
        const foreignLang = parsed.state?.lang;
        if (foreignLang === "zh" || foreignLang === "en") {
          if (useSettingsStore.getState().lang !== foreignLang) {
            useSettingsStore.setState({ lang: foreignLang });
          }
        }
      } catch (e) {
        console.warn("[settings] failed to sync foreign theme:", e);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);
}
